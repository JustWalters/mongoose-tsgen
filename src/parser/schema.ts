/**
 * Parser types
 */

import {
  convertBaseTypeToTs,
  getParseKeyFn,
  getShouldLeanIncludeVirtuals,
  getSubdocName
} from "./utils";
import _ from "lodash";
import * as templates from "../helpers/templates";
import { MongooseSchema, ParserSchemaField } from "./types";
import mongoose from "mongoose";

// old TODOs:
// - Handle statics method issue
// - Switch to using HydratedDocument, https://mongoosejs.com/docs/migrating_to_7.html. Also update query helpers https://mongoosejs.com/docs/typescript/query-helpers.html
// TODO: Look into new inference of types https://mongoosejs.com/docs/typescript/schemas.html

export class ParserSchema {
  modelName: string;
  model: any; // TODO: Better type
  mongooseSchema: MongooseSchema;
  fields: ParserSchemaField[];
  methods: Record<string, string> = {};
  statics: Record<string, string> = {};
  queries: Record<string, string> = {};
  virtuals: Record<string, string> = {};
  comments: { path: string; comment: string }[] = [];

  // schema.tree with custom field _aliasRootField, TODO: Create explicit type for this
  schemaTree: MongooseSchema["tree"] = {};

  shouldLeanIncludeVirtuals: boolean;

  constructor({
    mongooseSchema,
    modelName,
    model
  }: {
    mongooseSchema: MongooseSchema;
    modelName: string;
    model: mongoose.Model<any>;
  }) {
    this.model = model;
    this.modelName = modelName;
    this.mongooseSchema = mongooseSchema;
    this.schemaTree = this.parseTree();

    this.fields = this.generateFields(mongooseSchema);

    this.shouldLeanIncludeVirtuals = getShouldLeanIncludeVirtuals(mongooseSchema);
  }

  // TODO: Generate own representation
  private generateFields(_mongooseSchema: MongooseSchema): ParserSchemaField[] {
    // return Object.entries(mongooseSchema.tree).map(([name, field]) => ({
    //   name: field.name,
    //   type: field.type,
    //   isOptional: field.isOptional || false,
    //   isArray: field.isArray || false,
    //   isMap: field.isMap || false,
    //   ref: field.ref,
    //   virtual: field.virtual,
    //   comment: field.comment
    // }));
    return [];
  }

  public generateTemplate({
    isDocument,
    noMongoose,
    datesAsStrings,
    header,
    footer
  }: {
    isDocument: boolean;
    noMongoose: boolean;
    datesAsStrings: boolean;
    header: string;
    footer: string;
  }): string {
    let template = "";

    if (this.mongooseSchema.childSchemas && this.modelName) {
      const childParserSchemas = this.parseChildSchemas();

      // TODO: Splint into functuon
      childParserSchemas.forEach(child => {
        const path = child.model.path;

        const name = getSubdocName(path, this.modelName);

        let header = "";
        if (isDocument)
          header += child.mongooseSchema._isSubdocArray ?
            templates.getSubdocumentDocs(this.modelName, path) :
            templates.getDocumentDocs(this.modelName);
        else header += templates.getLeanDocs(this.modelName, name);

        header += "\nexport ";

        if (isDocument) {
          header += `type ${name}Document = `;
          if (child.mongooseSchema._isSubdocArray) {
            header += "mongoose.Types.Subdocument";
          }
          // not sure why schema doesnt have `tree` property for typings
          else {
            let _idType;
            // get type of _id to pass to mongoose.Document
            // this is likely unecessary, since non-subdocs are not allowed to have option _id: false (https://mongoosejs.com/docs/guide.html#_id)
            if ((this.mongooseSchema as any).tree._id)
              // TODO: Fix type manually
              _idType = convertBaseTypeToTs({
                key: "_id",
                val: (this.mongooseSchema as any).tree._id,
                isDocument: true,
                noMongoose,
                datesAsStrings
              });

            // TODO: this should extend `${name}Methods` like normal docs, but generator will only have methods, statics, etc. under the model name, not the subdoc model name
            // so after this is generated, we should do a pass and see if there are any child schemas that have non-subdoc definitions.
            // or could just wait until we dont need duplicate subdoc versions of docs (use the same one for both embedded doc and non-subdoc)
            header += `mongoose.Document<${_idType ?? "never"}>`;
          }

          header += " & {\n";
        } else header += `type ${name} = {\n`;

        const footer = `}\n\n`;
        template += child.generateTemplate({
          isDocument,
          noMongoose,
          datesAsStrings,
          header,
          footer
        });
      });
    }

    template += header;

    const parseKey = getParseKeyFn({
      isDocument,
      noMongoose,
      datesAsStrings,
      shouldLeanIncludeVirtuals: this.shouldLeanIncludeVirtuals
    });

    Object.entries(this.schemaTree).forEach(([key, val]) => {
      template += parseKey(key, val);
    });

    template += footer;
    return template;
  }

  /**
   * Parses the schema tree, and adds _aliasRootField to the tree for aliases.
   * @returns The parsed schema tree.
   */
  parseTree = (): Record<string, any> => {
    const tree = _.cloneDeep(this.mongooseSchema.tree);

    if (!_.isEmpty(this.mongooseSchema.aliases) && this.modelName) {
      Object.entries(this.mongooseSchema.aliases).forEach(([alias, path]: [string, any]) => {
        _.set(tree, `${alias}._aliasRootField`, _.get(tree, path));
      });
    }

    return tree;
  };

  parseChildSchemas = (): ParserSchema[] => {
    const mongooseChildSchemas = _.cloneDeep(this.mongooseSchema.childSchemas);

    const childSchemas: ParserSchema[] = [];

    console.log("this.mongooseSchema.paths: ", this.mongooseSchema.paths);
    // NOTE: This is a hack for Schema maps. For some reason, when a map of a schema exists, the schema is not included
    // in childSchemas. So we add it manually and add a few extra properties to ensure the processChild works correctly.
    for (const [path, type] of Object.entries(this.mongooseSchema.paths)) {
      // This check tells us that this is a map of a separate schema
      if ((type as any)?.$isSchemaMap && (type as any)?.$__schemaType.schema) {
        const childSchema = (type as any).$__schemaType;
        childSchema.model = {
          path: path,
          // TODO: Augment the mongoose schema with these, or dont update them in place would be even better
          $isArraySubdocument:
            childSchema.Constructor?.$isArraySubdocument ??
            childSchema.$isMongooseDocumentArray ??
            false,
          $isSchemaMap: true
        };
        mongooseChildSchemas.push(childSchema);
      }
    }

    for (const child of mongooseChildSchemas) {
      const path = child.model.path;
      const isSubdocArray = child.model.$isArraySubdocument;
      const isSchemaMap = child.model.$isSchemaMap ?? false;
      const name = getSubdocName(path, this.modelName);

      child.schema._isReplacedWithSchema = true;
      child.schema._inferredInterfaceName = name;
      child.schema._isSubdocArray = isSubdocArray;
      child.schema._isSchemaMap = isSchemaMap;

      const requiredValuePath = `${path}.required`;
      if (_.get(this.schemaTree, requiredValuePath) === true) {
        child.schema.required = true;
      }

      /**
       * for subdocument arrays, mongoose supports passing `default: undefined` to disable the default empty array created.
       * here we indicate this on the child schema using _isDefaultSetToUndefined so that the parser properly sets the `isOptional` flag
       */
      if (isSubdocArray) {
        const defaultValuePath = `${path}.default`;
        if (
          _.has(this.schemaTree, defaultValuePath) &&
          _.get(this.schemaTree, defaultValuePath) === undefined
        ) {
          child.schema._isDefaultSetToUndefined = true;
        }
      }

      if (isSchemaMap) {
        _.set(this.schemaTree, path, {
          type: Map,
          of: isSubdocArray ? [child.schema] : child.schema
        });
      } else if (isSubdocArray) {
        _.set(this.schemaTree, path, [child.schema]);
      } else {
        _.set(this.schemaTree, path, child.schema);
      }

      const childSchema = new ParserSchema({
        mongooseSchema: child.schema,
        modelName: name,
        model: child.model
      });

      childSchemas.push(childSchema);
    }

    return childSchemas;
  };
}

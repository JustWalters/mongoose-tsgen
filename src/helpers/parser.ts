import mongoose from "mongoose";
import flatten, { unflatten } from "flat";
import _ from "lodash";

import * as templates from "./templates";
import { MIGRATE_THIS_VIRTUAL_MANUALLY, MIGRATION_IS_NOT_DONE, THIS_PROPERTY_IS_TOO_DEEP } from "../constants";
import { pascalCase } from "./formatter";

export const getShouldLeanIncludeVirtuals = (schema: any) => {
  // Check the toObject options to determine if virtual property should be included.
  // See https://mongoosejs.com/docs/api.html#document_Document-toObject for toObject option documentation.
  const toObjectOptions = schema.options?.toObject ?? {};
  if (
    (!toObjectOptions.virtuals && !toObjectOptions.getters) ||
    (toObjectOptions.virtuals === false && toObjectOptions.getters === true)
  )
    return false;
  return true;
};

export const getSchemaOptions = (schema: any) => {
  return _.isEmpty(schema._userProvidedOptions) ? "" : JSON.stringify(schema._userProvidedOptions);
};

const formatKeyEntry = ({
  key,
  val,
  isOptional = false,
  newline = true
}: {
  key: string;
  val: string;
  isOptional?: boolean;
  newline?: boolean;
}) => {
  let line = "";

  if (key) {
    line += key;
    if (isOptional) line += "?";
    line += ": ";
  }
  line += val + ";";
  if (newline) line += "\n";
  return line;
};

export const convertFuncSignatureToType = (
  funcSignature: string,
  funcType: "methods" | "statics" | "query",
  modelName: string
) => {
  const [, params, returnType] = funcSignature.match(/\((?:this: \w*(?:, )?)?(.*)\) => (.*)/) ?? [];
  let type;
  if (funcType === "query") {
    type = `(this: ${modelName}Query${
      params?.length > 0 ? ", " + params : ""
    }) => ${modelName}Query`;
  } else if (funcType === "methods") {
    type = `(this: ${modelName}Document${params?.length > 0 ? ", " + params : ""}) => ${
      returnType ?? "any"
    }`;
  } else {
    type = `(this: ${modelName}Model${params?.length > 0 ? ", " + params : ""}) => ${
      returnType ?? "any"
    }`;
  }
  return type;
};

export const convertToSingular = (str: string) => {
  if (str.endsWith("sses")) {
    // https://github.com/francescov1/mongoose-tsgen/issues/79
    return str.slice(0, -2);
  }

  if (str.endsWith("s") && !str.endsWith("ss")) {
    return str.slice(0, -1);
  }
  return str;
};

const getSubDocName = (path: string, modelName = "") => {
  const subDocName =
    modelName +
    path
      .split(".")
      .map((p: string) => p[0].toUpperCase() + p.slice(1))
      .join("");

  return convertToSingular(subDocName);
};

// TODO: this could be moved to the generator too, not really relevant to parsing
export const parseFunctions = (
  funcs: any,
  modelName: string,
  funcType: "methods" | "statics" | "query"
) => {
  let interfaceString = "";

  Object.keys(funcs).forEach(key => {
    if (["initializeTimestamps"].includes(key)) return;

    const funcSignature = "(...args: any[]) => any";
    const type = convertFuncSignatureToType(funcSignature, funcType, modelName);
    interfaceString += formatKeyEntry({ key, val: type });
  });

  return interfaceString;
};

const BASE_TYPES = [
  Object,
  String,
  "String",
  Number,
  "Number",
  Boolean,
  "Boolean",
  Date,
  "Date",
  Buffer,
  "Buffer",
  mongoose.Types.Buffer,
  mongoose.Schema.Types.Buffer,
  mongoose.Schema.Types.ObjectId,
  mongoose.Types.ObjectId,
  mongoose.Types.Decimal128,
  mongoose.Schema.Types.Decimal128
];

export const convertBaseTypeToTs = (
  key: string,
  val: any,
  isDocument: boolean,
  noMongoose = false
) => {
  // NOTE: ideally we check actual type of value to ensure its Schema.Types.Mixed (the same way we do with Schema.Types.ObjectId),
  // but this doesnt seem to work for some reason
  // {} is treated as Mixed
  if (
    val.schemaName === "Mixed" ||
    val.type?.schemaName === "Mixed" ||
    (val.constructor === Object && _.isEmpty(val)) ||
    (val.type?.constructor === Object && _.isEmpty(val.type))
  ) {
    return "any";
  }

  const mongooseType = val.type === Map ? val.of : val.type;
  switch (mongooseType) {
    case String:
    case "String":
      if (val.enum?.length > 0) {
        const includesNull = val.enum.includes(null);
        const enumValues = val.enum.filter((str: string) => str !== null);
        let enumString = `"` + enumValues.join(`" | "`) + `"`;
        if (includesNull) enumString += ` | null`;

        return enumString;
      }

      return "string";
    case Number:
    case "Number":
      return key === "__v" ? undefined : "number";
    case mongoose.Schema.Types.Decimal128:
    case mongoose.Types.Decimal128:
      return isDocument ? "mongoose.Types.Decimal128" : "number";
    case Boolean:
    case "Boolean":
      return "boolean";
    case Date:
    case "Date":
      return "Date";
    case mongoose.Types.Buffer:
    case mongoose.Schema.Types.Buffer:
    case Buffer:
    case "Buffer":
      return isDocument ? "mongoose.Types.Buffer" : "Buffer";
    case mongoose.Schema.Types.ObjectId:
    case mongoose.Types.ObjectId:
    case "ObjectId": // _id fields have type set to the string "ObjectId"
      return noMongoose ? "string" : "mongoose.Types.ObjectId";
    case Object:
      return "any";
    default:
      // this indicates to the parent func that this type is nested and we need to traverse one level deeper
      return "{}";
  }
};

const parseChildSchemas = ({
  schema,
  isDocument,
  noMongoose,
  modelName,
  shouldIncludeDecorators
}: {
  schema: any;
  isDocument: boolean;
  noMongoose: boolean;
  modelName: string;
  shouldIncludeDecorators: boolean;
}) => {
  const flatSchemaTree: any = flatten(schema.tree, { safe: true });
  let childInterfaces = "";

  const processChild = (rootPath: string) => {
    return (child: any) => {
      const path = child.model.path;
      const isSubdocArray = child.model.$isArraySubdocument;
      const name = getSubDocName(path, rootPath);
      const defaultValuePath = `${path}.default`;
      const narrativePath = `${path}.narrative`;

      child.schema = _.cloneDeep(child.schema);
      child.schema._isReplacedWithSchema = true;
      child.schema._inferredInterfaceName = name;
      child.schema._isSubdocArray = isSubdocArray;
      child.schema._default = flatSchemaTree[defaultValuePath];
      // Is there a generic way to get the narrative?
      child.schema._narrative = (() => {
        const fullNarrativePaths = Object.keys(flatSchemaTree).filter(k => k.includes(narrativePath))
        if (fullNarrativePaths.length === 0) { 
          return
        }

        const narrativeObj: Record<string, any> = {}
        fullNarrativePaths.forEach(path => {
          const value = flatSchemaTree[path]
          const key = path.replace(`${narrativePath}.`, "")
          narrativeObj[key] = value
        })
        return narrativeObj
      })()

      const requiredValuePath = `${path}.required`;
      if (requiredValuePath in flatSchemaTree && flatSchemaTree[requiredValuePath] === true) {
        child.schema.required = true;
      }

      /**
       * for subdocument arrays, mongoose supports passing `default: undefined` to disable the default empty array created.
       * here we indicate this on the child schema using _isDefaultSetToUndefined so that the parser properly sets the `isOptional` flag
       */
      if (isSubdocArray) {
        if (defaultValuePath in flatSchemaTree && flatSchemaTree[defaultValuePath] === undefined) {
          child.schema._isDefaultSetToUndefined = true;
        }
      }
      flatSchemaTree[path] = isSubdocArray ? [child.schema] : child.schema;

      // since we now will process this child by using the schema, we can remove any further nested properties in flatSchemaTree
      for (const key in flatSchemaTree) {
        if (key.startsWith(path) && key.length > path.length && key[path.length] === ".") {
          delete flatSchemaTree[key];
        }
      }

      let header = "";
      if (isDocument)
        header += isSubdocArray ?
          templates.getSubdocumentDocs(rootPath, path) :
          templates.getDocumentDocs(rootPath);
      else header += templates.getLeanDocs(rootPath, name);

      if (shouldIncludeDecorators) {
        header += `\n@Schema(${getSchemaOptions(child.schema)})`;
        header += `\nexport class ${name} extends mongoose.Types.Subdocument {\n`;

        // TODO: this should not circularly call parseSchema
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        childInterfaces += parseSchema({
          schema: child.schema,
          modelName: name,
          header,
          isDocument,
          footer: `}${
            shouldIncludeDecorators &&
            `\n\nexport const ${name}Schema = SchemaFactory.createForClass(${name});`
          }\n\n`,
          noMongoose,
          shouldLeanIncludeVirtuals: true, // getShouldLeanIncludeVirtuals(child.schema),
          shouldIncludeDecorators: true
        });
      } else {
        header += "\nexport ";

        if (isDocument) {
          header += `type ${name}Document = `;
          if (isSubdocArray) {
            header += "mongoose.Types.Subdocument";
          }
          // not sure why schema doesnt have `tree` property for typings
          else {
            let _idType;
            // get type of _id to pass to mongoose.Document
            // this is likely unecessary, since non-subdocs are not allowed to have option _id: false (https://mongoosejs.com/docs/guide.html#_id)
            if ((schema as any).tree._id)
              _idType = convertBaseTypeToTs("_id", (schema as any).tree._id, true, noMongoose);

            // TODO: this should extend `${name}Methods` like normal docs, but generator will only have methods, statics, etc. under the model name, not the subdoc model name
            // so after this is generated, we should do a pass and see if there are any child schemas that have non-subdoc definitions.
            // or could just wait until we dont need duplicate subdoc versions of docs (use the same one for both embedded doc and non-subdoc)
            header += `mongoose.Document<${_idType ?? "never"}>`;
          }

          header += " & {\n";
        } else header += `type ${name} = {\n`;

        // TODO: this should not circularly call parseSchema
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        childInterfaces += parseSchema({
          schema: child.schema,
          modelName: name,
          header,
          isDocument,
          footer: `}\n\n`,
          noMongoose,
          shouldLeanIncludeVirtuals: getShouldLeanIncludeVirtuals(child.schema)
        });
      }
    };
  };

  schema.childSchemas.forEach(processChild(modelName));

  const schemaTree = unflatten(flatSchemaTree);
  schema.tree = schemaTree;

  return childInterfaces;
};

const formatPropOptions = (options: object) => {
  if (_.isEmpty(options)) return "";

  return (
    JSON.stringify(options, (key, value) => {
      if (typeof value === "function") {
        return MIGRATION_IS_NOT_DONE;
      }
      if (value instanceof RegExp) {
        return MIGRATION_IS_NOT_DONE;
      }
      return value;
    })
      .replace(/"Map<string, ([A-Za-z_[\]]+)>"/, "mongoose.Types.Map<$1>")
      .replace(/Map<string, ([A-Za-z_]+)>/, "mongoose.Types.Map<$1>")
      .replace('"type":"MongooseSchema.Types.ObjectId"', '"type":mongoose.Types.ObjectId')
      .replace('"type":"mongoose.Types.ObjectId"', '"type":mongoose.Types.ObjectId')
      .replace(/"type":"mongoose.Types.Array<([A-Za-z_]+)>"/, '"type":[$1]')
      .replace(/"type":"mongoose.Types.DocumentArray<(.+)>"/, '"type":[$1]')
      .replace('"type":"any"', '"type":mongoose.Schema.Types.Mixed')
      // TODO: This could probably be moved earlier in the process?
      .replace(/"type":"{.+}"/, '"type":mongoose.Schema.Types.Mixed')
      .replace(/<\(?([a-zA-Z0-9_.<>]+)\)?\[\]>/, "<[$1]>") // For Maps
      .replace(/"type":"\(?([a-zA-Z0-9_.<>]+)\)?\[\]"/, '"type":[$1]')
      .replace(/"type":"(\w+)"/, (match, valType) => {
        // TODO: Reuse this Schema suffix adder
        const subSchema = BASE_TYPES.map(String)
          .map(t => t.toLowerCase())
          .includes(valType.toLowerCase()) ?
          valType :
          `${valType}Schema`;
        return `"type":${subSchema}`;
      })
      .replace(/"type":\[(\w+)\]/, (match, valType) => {
        const subSchema = BASE_TYPES.map(String)
          .map(t => t.toLowerCase())
          .includes(valType.toLowerCase()) ?
          valType :
          `${valType}Schema`;
        return `"type":[${subSchema}]`;
      })
      .replace(/"type":"(.+ \| .+)"/g, (match, valType) => {
        const isAPopulatableField = match.includes('[\\"_id\\"]');
        if (isAPopulatableField) return '"type":mongoose.Types.ObjectId';

        return `"type":String,"enum":[${valType.replace(/ \|/g, ",")}]`.replace(/\\"/g, '"');
      })
      // The below types omit "type:" to allow for arrays
      .replace("string", "String")
      .replace("number", "Number")
      .replace("boolean", "Boolean")
  );
};

const formatPropDecorator = ({
  nestDecorators,
  key,
  valType,
  options,
  isOptional = false
}: {
  nestDecorators: boolean;
  key: string;
  valType: string;
  options?: any;
  isOptional?: boolean;
}): string => {
  if (!nestDecorators) return "";

  if (key === "_id") return "";

  const inferrableTypes = ['string', 'number', 'boolean', 'Date', 'MongooseSchema.Types.ObjectId', 'mongoose.Types.ObjectId']

  const propOptions: any = _.pick(options, [
    "default",
    "required",
    "ref",
    "trim",
    "lowercase",
    "unique",
    "validate",
    "match",
    "get",
  ]);
  if (!inferrableTypes.includes(valType)) {
    propOptions.type = valType;
  }

  if (options._default !== undefined && propOptions.default === undefined)
    propOptions.default = options._default;

  if (options._narrative)
    propOptions.narrative = options._narrative;
  
  if (!isOptional && propOptions.required === undefined) {
    propOptions.required = true;
  }

  return `@Prop(${formatPropOptions(propOptions)})\n`;
};

export const getParseKeyFn = (
  isDocument: boolean,
  shouldLeanIncludeVirtuals: boolean,
  noMongoose: boolean,
  includeDecorators = false,
  fromModel = false,
  depth = 0
) => {
  return (key: string, valOriginal: any): string => {
    // if the value is an object, we need to deepClone it to ensure changes to `val` aren't persisted in parent function
    let val = _.isPlainObject(valOriginal) ? _.cloneDeep(valOriginal) : valOriginal;

    let valType: string | undefined;

    const requiredValue = Array.isArray(val.required) ? val.required[0] : val.required;
    let isOptional = requiredValue !== true;

    let isArray = Array.isArray(val);
    let isUntypedArray = false;
    let isMapOfArray = false;
    /**
     * If _isDefaultSetToUndefined is set, it means this is a subdoc array with `default: undefined`, indicating that mongoose will not automatically
     * assign an empty array to the value. Therefore, isOptional = true. In other cases, isOptional is false since the field will be automatically initialized
     * with an empty array
     */
    const isArrayOuterDefaultSetToUndefined = Boolean(val._isDefaultSetToUndefined);

    // this means its a subdoc
    if (isArray) {
      val = val[0];
      if (val === undefined && val?.type === undefined) {
        isUntypedArray = true;
        isOptional = isArrayOuterDefaultSetToUndefined ?? false;
      } else {
        isOptional = val._isDefaultSetToUndefined ?? false;
      }
    } else if (Array.isArray(val.type)) {
      val.type = val.type[0];
      isArray = true;

      if (val.type === undefined) {
        isUntypedArray = true;
        isOptional = isArrayOuterDefaultSetToUndefined ?? false;
      } else if (val.type.type) {
        /**
         * Arrays can also take the following format.
         * This is used when validation needs to be done on both the element itself and the full array.
         * This format implies `required: true`.
         *
         * ```
         * friends: {
         *   type: [
         *     {
         *       type: Schema.Types.ObjectId,
         *       ref: "User",
         *       validate: [
         *         function(userId: mongoose.Types.ObjectId) { return !this.friends.includes(userId); }
         *       ]
         *     }
         *   ],
         *   validate: [function(val) { return val.length <= 3; } ]
         * }
         * ```
         */
        if (val.type.ref) val.ref = val.type.ref;
        val.type = val.type.type;
        isOptional = false;
      } else {
        // 2dsphere index is a special edge case which does not have an inherent default value of []
        isOptional = val.index === "2dsphere" ? true : isArrayOuterDefaultSetToUndefined;
      }
    }

    if (BASE_TYPES.includes(val)) val = { type: val };

    const isMap = val?.type === Map;

    // // handles maps of arrays as per https://github.com/francescov1/mongoose-tsgen/issues/63
    if (isMap && Array.isArray(val.of)) {
      val.of = val.of[0];
      isMapOfArray = true;
      isArray = true;
    }

    if (val === Array || val?.type === Array || isUntypedArray) {
      // treat Array constructor and [] as an Array<Mixed>
      isArray = true;
      valType = "any";
      isOptional = isArrayOuterDefaultSetToUndefined ?? false;
    } else if (val._inferredInterfaceName) {
      valType = val._inferredInterfaceName + (isDocument ? "Document" : "");
    } else if (val.path && val.path && val.setters && val.getters) {
      // check for virtual properties
      // skip id property
      if (key === "id") return "";

      // if not lean doc and lean docs shouldnt include virtuals, ignore entry
      if (!isDocument && !shouldLeanIncludeVirtuals) return "";

      // We add proper virtuals for models already
      if (fromModel && !isDocument) return ""

      valType = MIGRATE_THIS_VIRTUAL_MANUALLY;
      isOptional = false;
    } else if (
      key &&
      [
        "get",
        "set",
        "schemaName",
        "defaultOptions",
        "_checkRequired",
        "_cast",
        "checkRequired",
        "cast",
        "__v"
      ].includes(key)
    ) {
      return "";
    } else if (val.ref) {
      let docRef: string;

      if (typeof val.ref === "string") {
        docRef = val.ref.replace(`'`, "");
      } else if (val.ref.name) {
        docRef = val.ref.modelName;
      } else {
        docRef = ''
      }

      if (docRef.includes(".")) {
        docRef = getSubDocName(docRef);
      }

      valType = isDocument ?
        `${docRef}Document["_id"] | ${docRef}Document` :
        `${docRef}["_id"] | ${docRef}`;
    } else {
      // _ids are always required
      if (key === "_id") isOptional = false;
      const convertedType = convertBaseTypeToTs(key, val, isDocument, noMongoose);

      if (depth > 15) {
        valType = THIS_PROPERTY_IS_TOO_DEEP;
      } else
      // TODO: we should detect nested types from unknown types and handle differently.
      // Currently, if we get an unknown type (ie not handled) then users run into a "max callstack exceeded error"
      if (convertedType === "{}") {
        const nestedSchema = _.cloneDeep(val);
        valType = "{\n";

        const parseKey = getParseKeyFn(isDocument, shouldLeanIncludeVirtuals, noMongoose, false, false, depth + 1);
        Object.keys(nestedSchema).forEach((key: string) => {
          valType += parseKey(key, nestedSchema[key]);
        });

        valType += "}";
        // JustinTODO: I don't know if we need the isOptional = false for our purposes. I don't fully understand it.
        // isOptional = false;
      } else {
        valType = convertedType;
      }
    }

    if (!valType) return "";

    if (isMap && !isMapOfArray)
      valType = isDocument ? `mongoose.Types.Map<${valType}>` : `Map<string, ${valType}>`;

    if (isArray) {
      if (isDocument)
        valType = `mongoose.Types.${val._isSubdocArray ? "Document" : ""}Array<` + valType + ">";
      else if (val._isSubdocArray && includeDecorators) {
        valType = `mongoose.Types.DocumentArray<${valType}>`;
      } else {
        // if valType includes a space, likely means its a union type (ie "number | string") so lets wrap it in brackets when adding the array to the type
        if (valType.includes(" ")) valType = `(${valType})`;
        valType = `${valType}[]`;
      }
    }

    // a little messy, but if we have a map of arrays, we need to wrap the value after adding the array info
    if (isMap && isMapOfArray)
      valType = isDocument ? `mongoose.Types.Map<${valType}>` : `Map<string, ${valType}>`;

    const propDecorator = formatPropDecorator({
      nestDecorators: includeDecorators,
      key,
      valType,
      isOptional,
      options: val
    });

    return propDecorator + formatKeyEntry({ key, val: valType, isOptional });
  };
};

export const parseSchema = ({
  schema: schemaOriginal,
  modelName,
  isDocument,
  header = "",
  footer = "",
  noMongoose = false,
  shouldLeanIncludeVirtuals,
  shouldIncludeDecorators = false,
  skipChildSchemas = false,
}: {
  schema: any;
  modelName?: string;
  isDocument: boolean;
  header?: string;
  footer?: string;
  noMongoose?: boolean;
  shouldLeanIncludeVirtuals: boolean;
  shouldIncludeDecorators?: boolean;
  skipChildSchemas?: boolean;
}) => {
  let template = "";
  const schema = _.cloneDeep(schemaOriginal);

  if (schema.childSchemas?.length > 0 && modelName) {
    template += parseChildSchemas({
      schema,
      isDocument,
      noMongoose,
      modelName,
      shouldIncludeDecorators
    });
  }

  template += header;

  const schemaTree = schema.tree;
  const MODEL_NAME = 'Report'; // We're getting reaaal hacky

  const parseKey = getParseKeyFn(
    isDocument,
    shouldLeanIncludeVirtuals,
    noMongoose,
    shouldIncludeDecorators,
    modelName === MODEL_NAME,
  );

  Object.keys(schemaTree).forEach((key: string) => {
    const val = schemaTree[key];
    template += parseKey(key, val);
  });

  template += footer;

  return template;
};

interface LoadedSchemas {
  [modelName: string]: mongoose.Schema;
}

export const loadSchemas = (modelsPaths: string[]) => {
  const schemas: LoadedSchemas = {};

  const checkAndRegisterModel = (obj: any): boolean => {
    if (!obj?.modelName || !obj?.schema) return false;
    schemas[obj.modelName] = obj.schema;
    return true;
  };

  modelsPaths.forEach((singleModelPath: string) => {
    let exportedData;
    try {
      exportedData = require(singleModelPath);
    } catch (err) {
      if ((err as Error).message?.includes(`Cannot find module '${singleModelPath}'`))
        throw new Error(`Could not find a module at path ${singleModelPath}.`);
      else throw err;
    }

    const prevSchemaCount = Object.keys(schemas).length;

    // NOTE: This was used to find the most likely names of the model based on the filename, and only check those properties for mongoose models. Now, we check all properties, but this could be used as a "strict" option down the road.

    // we check each file's export object for property names that would commonly export the schema.
    // Here is the priority (using the filename as a starting point to determine model name):
    // default export, model name (ie `User`), model name lowercase (ie `user`), collection name (ie `users`), collection name uppercased (ie `Users`).
    // If none of those exist, we assume the export object is set to the schema directly
    /*
    // if exported data has a default export, use that
    if (checkAndRegisterModel(exportedData.default) || checkAndRegisterModel(exportedData)) return;

    // if no default export, look for a property matching file name
    const { name: filenameRoot } = path.parse(singleModelPath);

    // capitalize first char
    const modelName = filenameRoot.charAt(0).toUpperCase() + filenameRoot.slice(1);
    const collectionNameUppercased = modelName + "s";

    let modelNameLowercase = filenameRoot.endsWith("s") ? filenameRoot.slice(0, -1) : filenameRoot;
    modelNameLowercase = modelNameLowercase.toLowerCase();

    const collectionName = modelNameLowercase + "s";

    // check likely names that schema would be exported from
    if (
      checkAndRegisterModel(exportedData[modelName]) ||
      checkAndRegisterModel(exportedData[modelNameLowercase]) ||
      checkAndRegisterModel(exportedData[collectionName]) ||
      checkAndRegisterModel(exportedData[collectionNameUppercased])
    )
      return;
    */

    // check if exported object is a model
    checkAndRegisterModel(exportedData);

    // iterate through each exported property, check if val is a schema and add to schemas if so
    for (const obj of Object.values(exportedData)) {
      checkAndRegisterModel(obj);
    }

    const schemaCount = Object.keys(schemas).length - prevSchemaCount;
    if (schemaCount === 0) {
      console.warn(
        `A module was found at ${singleModelPath}, but no new exported models were found. If this file contains a Mongoose schema, ensure it is exported and its name does not conflict with others.`
      );
    }
  });

  return schemas;
};

export const loadSchemasFromSchemaFiles = (schemasPaths: string[]) => {
  const schemas: LoadedSchemas = {};

  const registerSchema = (key: string, obj: any): boolean => {
    if (!obj?.obj || !obj?.paths || !obj?.singleNestedPaths) return false;
    schemas[pascalCase(key)] = obj;
    return true;
  };

  schemasPaths.forEach((singleSchemaPath: string) => {
    if (singleSchemaPath.includes('report.schema')) return;
    let exportedData;
    try {
      exportedData = require(singleSchemaPath);
    } catch (err) {
      if ((err as Error).message?.includes(`Cannot find module '${singleSchemaPath}'`))
        throw new Error(`Could not find a module at path ${singleSchemaPath}.`);
      else throw err;
    }

    const prevSchemaCount = Object.keys(schemas).length;

    // iterate through each exported property, check if val is a schema and add to schemas if so
    for (const [key, obj] of Object.entries(exportedData)) {
      if (key === 'default') {
        let [,schemaName] = singleSchemaPath.match(/\/([A-Za-z0-9_-]+).schema.js/) || [];
        if (schemaName) {
          registerSchema(schemaName, obj);
        } else {
          if (process.env.DEBUG)
            console.warn(`Could not find a schema name for default export in ${singleSchemaPath}`);
        }
      } else {
        registerSchema(key, obj);
      }
    }

    const schemaCount = Object.keys(schemas).length - prevSchemaCount;
    if (schemaCount === 0) {
      console.warn(
        `A module was found at ${singleSchemaPath}, but no new exported models were found. If this file contains a Mongoose schema, ensure it is exported and its name does not conflict with others.`
      );
    }
  });

  return schemas;
};

import {
  Node,
  Project,
  SourceFile,
  SyntaxKind,
  PropertySignature,
  PropertyDeclaration
} from "ts-morph";
import mongoose from "mongoose";
import * as parser from "./parser";
import * as templates from "./templates";
import { ModelTypes } from "../types";

// this strips comments of special tokens since ts-morph generates jsdoc tokens automatically
const cleanComment = (comment: string) => {
  return comment
    .replace(/^\/\*\*[^\S\r\n]?/, "")
    .replace(/[^\S\r\n]+\*\s/g, "")
    .replace(/(\n)?[^\S\r\n]+\*\/$/, "");
};

export const replaceModelTypes = (
  sourceFile: SourceFile,
  modelTypes: ModelTypes,
  schemas: {
    [modelName: string]: mongoose.Schema;
  }
) => {
  Object.entries(modelTypes).forEach(([modelName, types]) => {
    const { properties, methods, statics, query, virtuals, comments } = types;

    // properties
    if (properties && Object.keys(properties).length > 0) {
      sourceFile
        ?.getClass(modelName)
        ?.getChildrenOfKind(SyntaxKind.PropertyDeclaration)
        .forEach(prop => {
          const decoratorArg = prop.getDecorator("Prop")?.getArguments()[0];
          if (decoratorArg && decoratorArg.getText().includes("JustinTODO")) {
            if (Node.isObjectLiteralExpression(decoratorArg)) {
              decoratorArg.getProperties().forEach(property => {
                if (
                  Node.isPropertyAssignment(property) ||
                  Node.isShorthandPropertyAssignment(property)
                ) {
                  const propertyName = property.getName();
                  const propertyValue = property.getInitializer()?.getText();

                  if (propertyValue?.includes("JustinTODO")) {
                    const newType = properties[prop.getName()];

                    if (Node.isObjectLiteralExpression(newType)) {
                      const propertyFromSource = newType.getProperty(propertyName.slice(1, -1));
                      if (
                        Node.isPropertyAssignment(propertyFromSource) ||
                        Node.isShorthandPropertyAssignment(propertyFromSource)
                      ) {
                        const newInitializer = propertyFromSource.getInitializer();

                        property.setInitializer(newInitializer?.getText() || "");
                      }
                    }
                  }
                }
              });
            }
          }
        });
    }

    // methods
    if (Object.keys(methods).length > 0) {
      sourceFile
        ?.getTypeAlias(`${modelName}Methods`)
        ?.getFirstChildByKind(SyntaxKind.TypeLiteral)
        ?.getChildrenOfKind(SyntaxKind.PropertySignature)
        .forEach(prop => {
          const signature = methods[prop.getName()];
          if (signature) {
            const funcType = parser.convertFuncSignatureToType(signature, "methods", modelName);
            prop.setType(funcType);
          }
        });
    }

    // statics
    if (Object.keys(statics).length > 0) {
      sourceFile
        ?.getTypeAlias(`${modelName}Statics`)
        ?.getFirstChildByKind(SyntaxKind.TypeLiteral)
        ?.getChildrenOfKind(SyntaxKind.PropertySignature)
        .forEach(prop => {
          const signature = statics[prop.getName()];
          if (signature) {
            const funcType = parser.convertFuncSignatureToType(signature, "statics", modelName);
            prop.setType(funcType);
          }
        });
    }

    // queries
    if (Object.keys(query).length > 0) {
      sourceFile
        ?.getTypeAlias(`${modelName}Queries`)
        ?.getFirstChildByKind(SyntaxKind.TypeLiteral)
        ?.getChildrenOfKind(SyntaxKind.PropertySignature)
        .forEach(prop => {
          const signature = query[prop.getName()];
          if (signature) {
            const funcType = parser.convertFuncSignatureToType(signature, "query", modelName);
            prop.setType(funcType);
          }
        });
    }

    // virtuals
    const virtualNames = Object.keys(virtuals);
    if (virtualNames.length > 0) {
      const documentProperties = sourceFile
        ?.getTypeAlias(`${modelName}Document`)
        ?.getFirstChildByKind(SyntaxKind.IntersectionType)
        ?.getFirstChildByKind(SyntaxKind.TypeLiteral)
        ?.getChildrenOfKind(SyntaxKind.PropertySignature);

      // TODO: JW - This isn't quite right. Should be PropertyDeclaration[] | PropertySignature[]. But then .find is a problem. IDKY
      const leanProperties: false | undefined | (PropertyDeclaration | PropertySignature)[] =
        parser.getShouldLeanIncludeVirtuals(schemas[modelName]) &&
        (sourceFile
          ?.getTypeAlias(`${modelName}`)
          ?.getFirstChildByKind(SyntaxKind.TypeLiteral)
          ?.getChildrenOfKind(SyntaxKind.PropertySignature) ||
          sourceFile?.getClass(`${modelName}`)?.getChildrenOfKind(SyntaxKind.PropertyDeclaration));

      if (documentProperties || leanProperties) {
        virtualNames.forEach(virtualName => {
          const virtualNameComponents = virtualName.split(".");
          let nestedDocProps: PropertySignature[] | undefined;
          let nestedLeanProps: PropertyDeclaration[] | PropertySignature[] | undefined;

          virtualNameComponents.forEach((nameComponent, i) => {
            if (i === virtualNameComponents.length - 1) {
              if (documentProperties) {
                const docPropMatch = (nestedDocProps ?? documentProperties).find(
                  prop => prop.getName() === nameComponent
                );
                docPropMatch?.setType(virtuals[virtualName]);
              }
              if (leanProperties) {
                const leanPropMatch = (nestedLeanProps ?? leanProperties).find(
                  prop => prop.getName() === nameComponent
                );

                leanPropMatch?.setType(virtuals[virtualName]);
                if (leanPropMatch?.getKind() === SyntaxKind.PropertyDeclaration) {
                  const propertyDeclaration = leanPropMatch as PropertyDeclaration;
                  propertyDeclaration.getDecorators().forEach(decorator => {
                    decorator.remove();
                  });
                }
              }

              return;
            }

            if (documentProperties) {
              nestedDocProps = (nestedDocProps ?? documentProperties)
                .find(prop => prop.getName() === nameComponent)
                ?.getFirstChildByKind(SyntaxKind.TypeLiteral)
                ?.getChildrenOfKind(SyntaxKind.PropertySignature);
            }
            if (leanProperties) {
              nestedLeanProps = (nestedLeanProps ?? leanProperties)
                .find(prop => prop.getName() === nameComponent)
                ?.getFirstChildByKind(SyntaxKind.TypeLiteral)
                ?.getChildrenOfKind(SyntaxKind.PropertySignature);
            }
          });
        });
      }
    }

    // TODO: this section is almost identical to the virtual property section above, refactor
    if (comments.length > 0) {
      const documentProperties = sourceFile
        ?.getTypeAlias(`${modelName}Document`)
        ?.getFirstChildByKind(SyntaxKind.IntersectionType)
        ?.getFirstChildByKind(SyntaxKind.TypeLiteral)
        ?.getChildrenOfKind(SyntaxKind.PropertySignature);

      const leanProperties =
        sourceFile
          ?.getTypeAlias(`${modelName}`)
          ?.getFirstChildByKind(SyntaxKind.TypeLiteral)
          ?.getChildrenOfKind(SyntaxKind.PropertySignature) ||
        sourceFile?.getClass(`${modelName}`)?.getChildrenOfKind(SyntaxKind.PropertyDeclaration);

      comments.forEach(({ path, comment }) => {
        const pathComponents = path.split(".");
        let nestedDocProps: PropertySignature[] | undefined;
        // TODO: JW - What's the proper shared type here?
        let nestedLeanProps:
          | Pick<PropertySignature, "getName" | "addJsDoc" | "getFirstChildByKind">[]
          | undefined;

        pathComponents.forEach((nameComponent, i) => {
          if (i === pathComponents.length - 1) {
            if (documentProperties) {
              const docPropMatch = (nestedDocProps ?? documentProperties).find(
                prop => prop.getName() === nameComponent
              );

              docPropMatch?.addJsDoc(cleanComment(comment));
            }
            if (leanProperties) {
              const leanPropMatch = (nestedLeanProps ?? leanProperties).find(
                prop => prop.getName() === nameComponent
              );

              leanPropMatch?.addJsDoc(cleanComment(comment));
            }

            return;
          }

          if (documentProperties) {
            nestedDocProps = (nestedDocProps ?? documentProperties)
              .find(prop => prop.getName() === nameComponent)
              ?.getFirstChildByKind(SyntaxKind.TypeLiteral)
              ?.getChildrenOfKind(SyntaxKind.PropertySignature);
          }
          if (leanProperties) {
            nestedLeanProps = (nestedLeanProps ?? leanProperties)
              .find(prop => prop.getName() === nameComponent)
              ?.getFirstChildByKind(SyntaxKind.TypeLiteral)
              ?.getChildrenOfKind(SyntaxKind.PropertySignature);
          }
        });
      });
    }
  });
};

export const addPopulateHelpers = (sourceFile: SourceFile) => {
  sourceFile.addStatements("\n" + templates.POPULATE_HELPERS);
};

export const overloadQueryPopulate = (sourceFile: SourceFile) => {
  sourceFile.addStatements("\n" + templates.QUERY_POPULATE);
};

export const createSourceFile = (genPath: string) => {
  const project = new Project();
  const sourceFile = project.createSourceFile(genPath, "", { overwrite: true });
  return sourceFile;
};

export const getSchemaTypes = ({ schema, modelName }: { schema: any; modelName: string }) => {
  let schemaTypes = "";

  // add type alias to modelName so that it can be imported without clashing with the mongoose model
  schemaTypes += templates.getObjectDocs(modelName);
  schemaTypes += `\nexport type ${modelName}Object = ${modelName}\n\n`;

  schemaTypes += templates.getQueryDocs();
  schemaTypes += `\nexport type ${modelName}Query = mongoose.Query<any, ${modelName}Document, ${modelName}Queries> & ${modelName}Queries\n\n`;

  schemaTypes += templates.getQueryHelpersDocs(modelName);
  schemaTypes += `\nexport type ${modelName}Queries = {\n`;
  schemaTypes += parser.parseFunctions(schema.query ?? {}, modelName, "query");
  schemaTypes += "}\n";

  schemaTypes += `\nexport type ${modelName}Methods = {\n`;
  schemaTypes += parser.parseFunctions(schema.methods, modelName, "methods");
  schemaTypes += "}\n";

  schemaTypes += `\nexport type ${modelName}Statics = {\n`;
  schemaTypes += parser.parseFunctions(schema.statics, modelName, "statics");
  schemaTypes += "}\n\n";

  const modelExtend = `mongoose.Model<${modelName}Document, ${modelName}Queries>`;

  schemaTypes += templates.getModelDocs(modelName);
  schemaTypes += `\nexport type ${modelName}Model = ${modelExtend} & ${modelName}Statics\n\n`;

  schemaTypes += templates.getSchemaDocs(modelName);
  schemaTypes += `\nexport type ${modelName}Schema = mongoose.Schema<${modelName}Document, ${modelName}Model, ${modelName}Methods, ${modelName}Queries>\n\n`;

  return schemaTypes;
};

export const generateTypes = ({
  sourceFile,
  schemas,
  imports = [],
  noMongoose
}: {
  sourceFile: SourceFile;
  schemas: {
    [modelName: string]: mongoose.Schema;
  };
  imports?: string[];
  noMongoose?: boolean;
}) => {
  const shouldIncludeDecorators = true;
  sourceFile.addStatements(writer => {
    writer.write(templates.MAIN_HEADER).blankLine();
    // mongoose import
    if (!noMongoose) writer.write(templates.MONGOOSE_IMPORT);
    if (shouldIncludeDecorators) writer.blankLine().write(templates.NEST_JS_IMPORT);

    // custom, user-defined imports
    if (imports.length > 0) writer.write(imports.join("\n"));

    writer.blankLine();
    // writer.write("if (true)").block(() => {
    //     writer.write("something;");
    // });

    Object.keys(schemas).forEach(modelName => {
      const schema = schemas[modelName];

      const shouldLeanIncludeVirtuals = parser.getShouldLeanIncludeVirtuals(schema);
      // passing modelName causes childSchemas to be processed
      const leanInterfaceStr = parser.parseSchema({
        schema,
        modelName,
        isDocument: false,
        header:
          templates.getLeanDocs(modelName) +
          `\n${
            shouldIncludeDecorators && `@Schema(${parser.getSchemaOptions(schema)})\n`
          }export class ${modelName} extends mongoose.Types.Document {\n`,
        footer: `}${
          shouldIncludeDecorators &&
          `\n\nexport const ${modelName}Schema = SchemaFactory.createForClass(${modelName});\n`
        }`,
        noMongoose,
        shouldLeanIncludeVirtuals,
        shouldIncludeDecorators
      });

      writer.write(leanInterfaceStr).blankLine();

      // if noMongoose, skip adding document types
      if (noMongoose) return;

      // get type of _id to pass to mongoose.Document
      // not sure why schema doesnt have `tree` property for typings
      let _idType;
      if ((schema as any).tree._id) {
        _idType = parser.convertBaseTypeToTs("_id", (schema as any).tree._id, true, noMongoose);
      }

      const mongooseDocExtend = `mongoose.Document<${_idType ?? "never"}, ${modelName}Queries>`;

      let documentInterfaceStr = "";
      documentInterfaceStr += getSchemaTypes({ schema, modelName });
      documentInterfaceStr += parser.parseSchema({
        schema,
        modelName,
        isDocument: true,
        header:
          templates.getDocumentDocs(modelName) +
          `\nexport type ${modelName}Document = ${mongooseDocExtend} & ${modelName}Methods & {\n`,
        footer: "}",
        shouldLeanIncludeVirtuals
      });

      writer.write(documentInterfaceStr).blankLine();
    });
  });

  return sourceFile;
};

export const saveFile = ({ sourceFile }: { sourceFile: SourceFile; genFilePath: string }) => {
  try {
    sourceFile.saveSync();
    // fs.writeFileSync(genFilePath, sourceFile.getFullText(), "utf8");
  } catch (err) {
    // if folder doesnt exist, create and then write again
    // if (err.message.includes("ENOENT: no such file or directory")) {
    //   console.log(`Path ${genFilePath} not found; creating...`);

    //   const { dir } = path.parse(genFilePath);
    //   mkdirp.sync(dir);

    //   fs.writeFileSync(genFilePath, sourceFile.getFullText(), "utf8");
    // }
    console.error(err);
    throw err;
  }
};

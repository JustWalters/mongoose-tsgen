import {
  Project,
  Node,
  SyntaxKind,
  MethodDeclaration,
  SourceFile,
  VariableDeclaration,
  ExportAssignment,
  ObjectLiteralExpression,
  NewExpression,
  FunctionExpression,
  CallExpression
} from "ts-morph";
import glob from "glob";
import path from "path";
import _ from "lodash";
import * as fs from "fs";
import stripJsonComments from "strip-json-comments";
import { ModelTypes } from "../types";
import { pascalCase } from "./formatter";

Error.stackTraceLimit = 50;

function getNameAndType(funcDeclaration: MethodDeclaration) {
  const name = funcDeclaration.getName();
  const typeNode = funcDeclaration.getType();
  const type = typeNode.getText(funcDeclaration);
  return { name, type };
}

function findCommentsInFile(
  sourceFile: SourceFile,
  modelTypes: ModelTypes,
  maxCommentDepth: number
) {
  // TODO: this is reused from findTypesInFile, should abstract out instead
  const schemaModelMapping: {
    [schemaVariableName: string]: string;
  } = {};

  Object.keys(modelTypes).forEach((modelName: string) => {
    const { schemaVariableName } = modelTypes[modelName];
    if (schemaVariableName) schemaModelMapping[schemaVariableName] = modelName;
  });

  for (const statement of sourceFile.getStatements()) {
    if (!Node.isVariableStatement(statement)) continue;
    const varDeclarationList = statement.getChildAtIndexIfKind(
      0,
      SyntaxKind.VariableDeclarationList
    );
    if (!varDeclarationList) continue;
    const varDeclaration = varDeclarationList.getFirstChildByKind(SyntaxKind.VariableDeclaration);
    if (!varDeclaration) continue;

    const schemaName = varDeclaration.getFirstChildByKind(SyntaxKind.Identifier)?.getText();
    if (!schemaName) continue;

    const modelName = schemaModelMapping[schemaName];
    if (!modelName) {
      continue;
    }

    const newExpression = varDeclaration.getFirstChildByKind(SyntaxKind.NewExpression);
    if (!newExpression) continue;
    const objLiteralExp = newExpression.getFirstChildByKind(SyntaxKind.ObjectLiteralExpression);
    if (!objLiteralExp) continue;

    const extractComments = (objLiteralExp: ObjectLiteralExpression, rootPath: string) => {
      const propAssignments = objLiteralExp.getChildrenOfKind(SyntaxKind.PropertyAssignment);

      propAssignments.forEach(propAssignment => {
        const propName = propAssignment.getFirstChildByKind(SyntaxKind.Identifier)?.getText();
        if (!propName) return;

        const path = rootPath ? `${rootPath}.${propName}` : propName;
        propAssignment.getLeadingCommentRanges().forEach(commentRange => {
          const commentText = commentRange.getText();

          // skip comments that are not jsdocs
          if (!commentText.startsWith("/**")) return;

          modelTypes[modelName].comments.push({
            path,
            comment: commentText
          });
        });

        if (rootPath.split(".").length < maxCommentDepth) {
          const nestedObjLiteralExp = propAssignment.getFirstChildByKind(
            SyntaxKind.ObjectLiteralExpression
          );
          if (nestedObjLiteralExp) {
            extractComments(nestedObjLiteralExp, path);
          }
        }
      });
    };

    extractComments(objLiteralExp, "");
  }

  // TODO: get virtual comments

  return modelTypes;
}

function isSchemaConstructor(expression?: NewExpression): expression is NewExpression {
  if (!expression) return false;

  if (expression.getExpression().getText().includes("Schema")) {
    return true;
  }

  return false;
}

function getVirtualSetter(callExpr: CallExpression): FunctionExpression | undefined {
  let propAccessExpr = callExpr.getFirstChildByKind(SyntaxKind.PropertyAccessExpression);

  if (propAccessExpr?.getName() !== "set") {
    propAccessExpr = propAccessExpr
      ?.getFirstChildByKind(SyntaxKind.CallExpression)
      ?.getFirstChildByKind(SyntaxKind.PropertyAccessExpression);
  }

  if (propAccessExpr?.getName() !== "set") {
    return;
  }

  const funcExpr = propAccessExpr.getParent()?.getFirstChildByKind(SyntaxKind.FunctionExpression);

  return funcExpr;
}

// TODO: This only works for functions written in line, not function references
function getVirtualGetter(callExpr: CallExpression): FunctionExpression | undefined {
  let propAccessExpr = callExpr.getFirstChildByKind(SyntaxKind.PropertyAccessExpression);

  if (propAccessExpr?.getName() !== "get") {
    propAccessExpr = propAccessExpr
      ?.getFirstChildByKind(SyntaxKind.CallExpression)
      ?.getFirstChildByKind(SyntaxKind.PropertyAccessExpression);
  }

  if (propAccessExpr?.getName() !== "get") {
    return;
  }

  const funcExpr = propAccessExpr.getParent()?.getFirstChildByKind(SyntaxKind.FunctionExpression);

  return funcExpr;
}

function findPropertiesInFile(sourceFile: SourceFile, modelTypes: ModelTypes, backupSchemaName: string = '') {
  const schemaModelMapping: {
    [schemaVariableName: string]: string;
  } = {};

  Object.keys(modelTypes).forEach((modelName: string) => {
    const { schemaVariableName } = modelTypes[modelName];
    if (schemaVariableName) schemaModelMapping[schemaVariableName] = modelName;
  });

  for (const statement of sourceFile.getStatements()) {
    const potentialNewExpression = Node.isVariableStatement(statement) ? statement
      .getDeclarationList()
      .getDeclarations()[0]
      .getInitializerIfKind(SyntaxKind.NewExpression) : statement.getFirstChildByKind(SyntaxKind.NewExpression);
    if (!isSchemaConstructor(potentialNewExpression)) continue;

    const schemaDefinition = potentialNewExpression.getArguments()[0];
    if (!Node.isObjectLiteralExpression(schemaDefinition)) continue;

    const schemaVariableName = Node.isVariableStatement(statement) ? statement.getDeclarationList().getDeclarations()[0].getName() : backupSchemaName;
    let modelName = schemaModelMapping[schemaVariableName];

    const properties = (schemaDefinition as ObjectLiteralExpression).getProperties();
    if (!modelTypes[modelName]) {
      if (backupSchemaName) modelName = backupSchemaName;
      else continue;
    }

    properties.forEach(property => {
      if (Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property)) {
        modelTypes[modelName].properties[property.getName()] = property.getInitializer();
      } else {
        console.log("UNKNOWN Property Type", property.getText());
      }
    });
  }

  return modelTypes;
}

function findTypesInFile(sourceFile: SourceFile, modelTypes: ModelTypes) {
  const schemaModelMapping: {
    [schemaVariableName: string]: string;
  } = {};

  Object.keys(modelTypes).forEach((modelName: string) => {
    const { schemaVariableName } = modelTypes[modelName];
    if (schemaVariableName) schemaModelMapping[schemaVariableName] = modelName;
  });

  for (const statement of sourceFile.getStatements()) {
    try {
      if (!Node.isExpressionStatement(statement)) continue;

      const binaryExpr = statement.getChildAtIndexIfKind(0, SyntaxKind.BinaryExpression);
      const callExpr = statement.getChildAtIndexIfKind(0, SyntaxKind.CallExpression);
      if (binaryExpr) {
        // left is a propertyaccessexpression, children are [identifier, dottoken, identifier]
        const left = binaryExpr.getLeft();
        const right = binaryExpr.getRight();
        if (left.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
        if (
          right.getKind() !== SyntaxKind.AsExpression &&
          right.getKind() !== SyntaxKind.ObjectLiteralExpression &&
          right.getKind() !== SyntaxKind.TypeAssertionExpression
        )
          continue;

        const leftChildren = left.getChildren();

        let modelName: string;
        const hasSchemaIdentifier = leftChildren.some(child => {
          if (child.getKind() !== SyntaxKind.Identifier) return false;

          modelName = schemaModelMapping[child.getText()];
          if (!modelName) return false;

          return true;
        });

        const hasDotToken = leftChildren.some(child => child.getKind() === SyntaxKind.DotToken);

        if (!hasSchemaIdentifier || !hasDotToken) continue;

        const hasMethodsIdentifier = leftChildren.some(
          child => child.getKind() === SyntaxKind.Identifier && child.getText() === "methods"
        );
        const hasStaticsIdentifier = leftChildren.some(
          child => child.getKind() === SyntaxKind.Identifier && child.getText() === "statics"
        );
        const hasQueryIdentifier = leftChildren.some(
          child => child.getKind() === SyntaxKind.Identifier && child.getText() === "query"
        );

        let rightFuncDeclarations: any[] = [];
        if (right.getKind() === SyntaxKind.ObjectLiteralExpression) {
          rightFuncDeclarations = right.getChildrenOfKind(SyntaxKind.MethodDeclaration);
        } else if (right.getKind() === SyntaxKind.AsExpression) {
          const objLiteralExp = right.getFirstChildByKind(SyntaxKind.ObjectLiteralExpression);
          if (objLiteralExp)
            rightFuncDeclarations = objLiteralExp.getChildrenOfKind(SyntaxKind.MethodDeclaration);
        } else if (right.getKind() === SyntaxKind.TypeAssertionExpression) {
          const objLiteralExp = right.getFirstChildByKind(SyntaxKind.ObjectLiteralExpression);
          if (objLiteralExp) {
            rightFuncDeclarations = objLiteralExp.getChildrenOfKind(SyntaxKind.MethodDeclaration);
          }
        } else {
          rightFuncDeclarations = right.getChildrenOfKind(SyntaxKind.MethodDeclaration);
        }

        if (hasMethodsIdentifier) {
          rightFuncDeclarations.forEach((declaration: MethodDeclaration) => {
            const { name, type } = getNameAndType(declaration);
            modelTypes[modelName].methods[name] = type;
          });
        } else if (hasStaticsIdentifier) {
          rightFuncDeclarations.forEach((declaration: MethodDeclaration) => {
            const { name, type } = getNameAndType(declaration);
            modelTypes[modelName].statics[name] = type;
          });
        } else if (hasQueryIdentifier) {
          rightFuncDeclarations.forEach((declaration: MethodDeclaration) => {
            const { name, type } = getNameAndType(declaration);
            modelTypes[modelName].query[name] = type;
          });
        }
      } else if (callExpr) {
        // virtual property
        const setter = getVirtualSetter(callExpr);
        const getter = getVirtualGetter(callExpr);
        const firstAccessor =
          (getter?.getPos() ?? Number.MAX_SAFE_INTEGER) <
          (setter?.getPos() ?? Number.MAX_SAFE_INTEGER) ?
            getter :
            setter;
        const propAccessExpr = firstAccessor
          ?.getParent()
          .getFirstChildByKind(SyntaxKind.PropertyAccessExpression);

        const schemaVariableName = propAccessExpr
          ?.getFirstChildByKind(SyntaxKind.CallExpression)
          ?.getFirstChildByKind(SyntaxKind.PropertyAccessExpression)
          ?.getFirstChildByKind(SyntaxKind.Identifier)
          ?.getText();

        if (schemaVariableName) {
          if (process.env.DEBUG)
            console.log("tsreader: Found virtual on schema: " + schemaVariableName);
        } else continue;

        const modelName = schemaModelMapping[schemaVariableName];
        if (!modelName) {
          if (process.env.DEBUG)
            console.warn(
              "tsreader: Associated model name not found for schema: " + schemaVariableName
            );
          continue;
        }

        const callExpr2 = propAccessExpr?.getFirstChildByKind(SyntaxKind.CallExpression);
        const stringLiteral = callExpr2?.getArguments()[0];
        const virtualName = stringLiteral?.getText();
        if (!virtualName) {
          if (process.env.DEBUG)
            console.warn("tsreader: virtualName not found: ", {
              virtualName
            });
          continue;
        }

        const virtualNameSanitized = virtualName.slice(1, virtualName.length - 1);
        const virtuals = modelTypes[modelName].virtuals[virtualNameSanitized] || {};
        if (!virtuals.getter) virtuals.getter = getter;
        if (!virtuals.setter) virtuals.setter = setter;

        const funcExpr = firstAccessor
          ?.getParent()
          ?.getFirstChildByKind(SyntaxKind.FunctionExpression);

        const type = (() => {
          try {
            return virtuals.getter?.getType()?.getText(funcExpr);
          } catch (err) {
            // I don't yet know why or when this happens, but I want to ignore it for now
            if (err instanceof Error && err.name === 'TypeError' && err.message === 'Cannot read property \'exports\' of undefined') {
              return "=> unknown";
            }
            throw err;
          }
        })();

        const propAccessExpr2 = callExpr2?.getFirstChildByKind(SyntaxKind.PropertyAccessExpression);
        // console.log('WHATS THE NAME', propAccessExpr2?.getText(), 'with name', propAccessExpr2?.getName());
        if (propAccessExpr2?.getName() !== "virtual") continue;
        let returnType = type?.split("=> ")?.[1];
        if (!returnType) {
          if (process.env.DEBUG)
            console.warn("tsreader: returnType not found: ", {
              returnType
            });
          modelTypes[modelName].virtuals[virtualNameSanitized] = virtuals;
          continue;
        }

        /**
         * @experimental trying this out since certain virtual types are indeterminable and get set to void, which creates incorrect TS errors
         * This should be a fine workaround because virtual properties shouldn't return solely `void`, they return real values.
         */
        if (returnType === "void") returnType = "unknown";
        virtuals.returnType = returnType;

        modelTypes[modelName].virtuals[virtualNameSanitized] = virtuals;
      }
    } catch (e) {
      console.error('findTypesInFile', e, '\nfrom:', statement.getText());
      continue
    }
  }

  return modelTypes;
}

const parseModelInitializer = (
  d: VariableDeclaration | ExportAssignment,
  isModelNamedImport: boolean
) => {
  const callExpr = d.getFirstChildByKind(SyntaxKind.CallExpression);
  if (!callExpr) return undefined;

  const callExprStr = callExpr.getText().replace(/[\r\n\t ]/g, "");

  // if model is a named import, we can match this without `mongoose.` prefix
  const pattern = isModelNamedImport ?
    /model(?:<\w+,\w+(?:,\w+)?>)?\(["'`](\w+)["'`],(\w+),?\)/ :
    /mongoose\.model(?:<\w+,\w+(?:,\w+)?>)?\(["'`](\w+)["'`],(\w+),?\)/;
  const modelInitMatch = callExprStr.match(pattern);
  if (!modelInitMatch) {
    if (process.env.DEBUG) {
      console.warn(
        `tsreader: Could not find model name in Mongoose model initialization: ${callExprStr}`
      );
    }
    return undefined;
  }

  const [, modelName, schemaVariableName] = modelInitMatch;
  return { modelName, schemaVariableName };
};

const parseSchemaInitializer = (d: VariableDeclaration | ExportAssignment, filePath: string) => {
  let exprStr = "";

  const callExpr = d.getFirstChildByKind(SyntaxKind.CallExpression);
  if (!callExpr) {
    exprStr =
      d
        .getFirstChildByKind(SyntaxKind.NewExpression)
        ?.getText()
        .replace(/[\r\n\t ]/g, "") || "";
  } else {
    const callExprStr = callExpr.getText().replace(/[\r\n\t ]/g, "");
    exprStr = callExprStr;
  }

  const pattern = /Schema\(/;
  const schemaInitMatch = exprStr.match(pattern);
  if (!schemaInitMatch) {
    if (process.env.DEBUG) {
      console.warn(
        `tsreader: Could not find schema name in Mongoose schema initialization: ${exprStr}`
      );
    }
    return undefined;
  }

  const [, fileName] = filePath.match(/\/([A-Za-z0-9_-]+).schema.js/) || [];
  if (fileName) {
    const schemaVariableName = pascalCase(fileName);
    return { schemaVariableName, modelName: schemaVariableName };
  }

  if (process.env.DEBUG) {
    console.warn(
      `tsreader: Could not find schema name in Mongoose schema initialization in file: ${filePath}`
    );
  }
  return undefined;
};

function initModelTypes(sourceFile: SourceFile, filePath: string) {
  if (process.env.DEBUG) console.log("tsreader: Searching file for Mongoose schemas: " + filePath);

  const modelTypes: ModelTypes = {};
  const mongooseImport = sourceFile.getImportDeclaration("mongoose");

  let isModelNamedImport = false;
  mongooseImport?.getNamedImports().forEach(importSpecifier => {
    if (importSpecifier.getText() === "model") isModelNamedImport = true;
  });

  sourceFile.getVariableDeclarations().forEach(d => {
    if (!d.hasExportKeyword()) return;

    const { modelName, schemaVariableName } = parseModelInitializer(d, isModelNamedImport) ?? {};
    if (!modelName || !schemaVariableName) return;

    const modelVariableName = d.getName();

    modelTypes[modelName] = {
      schemaVariableName,
      modelVariableName,
      filePath,
      properties: {},
      methods: {},
      statics: {},
      query: {},
      virtuals: {},
      comments: []
    };
  });

  const defaultExportAssignment = sourceFile.getExportAssignment(d => !d.isExportEquals());
  if (defaultExportAssignment) {
    const defaultModelInit = parseModelInitializer(defaultExportAssignment, isModelNamedImport);
    if (defaultModelInit) {
      modelTypes[defaultModelInit.modelName] = {
        schemaVariableName: defaultModelInit.schemaVariableName,
        filePath,
        properties: {},
        methods: {},
        statics: {},
        query: {},
        virtuals: {},
        comments: []
      };
    }
  }

  if (process.env.DEBUG) {
    const schemaNames = Object.keys(modelTypes);
    if (schemaNames.length === 0)
      console.warn(
        `tsreader: No schema found in file. If a schema exists & is exported, it will still be typed but will use generic types for methods, statics, queries & virtuals`
      );
    else console.log("tsreader: Schemas found: " + schemaNames);
  }

  return modelTypes;
}

function initSchemaTypes(sourceFile: SourceFile, filePath: string) {
  if (process.env.DEBUG) console.log("tsreader: Searching file for Mongoose schemas: " + filePath);

  const schemaTypes: ModelTypes = {};
  const mongooseImport = sourceFile.getImportDeclaration("mongoose");

  let isModelNamedImport = false;
  mongooseImport?.getNamedImports().forEach((importSpecifier) => {
    if (importSpecifier.getText() === "model") isModelNamedImport = true;
  });

  sourceFile.getVariableDeclarations().forEach((d) => {
    if (!d.hasExportKeyword()) return;

    const { modelName, schemaVariableName } = parseSchemaInitializer(d, filePath) ?? {};
    if (!modelName || !schemaVariableName) return;

    const modelVariableName = d.getName();

    schemaTypes[modelName] = {
      schemaVariableName,
      modelVariableName,
      filePath,
      properties: {},
      methods: {},
      statics: {},
      query: {},
      virtuals: {},
      comments: []
    };
  });

  const defaultExportAssignment = sourceFile.getExportAssignment((d) => !d.isExportEquals());
  if (defaultExportAssignment) {
    const defaultModelInit = parseSchemaInitializer(defaultExportAssignment, filePath);
    if (defaultModelInit) {
      schemaTypes[defaultModelInit.modelName] = {
        schemaVariableName: defaultModelInit.schemaVariableName,
        filePath,
        properties: {},
        methods: {},
        statics: {},
        query: {},
        virtuals: {},
        comments: []
      };
    }
  }

  if (process.env.DEBUG) {
    const schemaNames = Object.keys(schemaTypes);
    if (schemaNames.length === 0)
      console.warn(
        `tsreader: No schema found in file. If a schema exists & is exported, it will still be typed but will use generic types for methods, statics, queries & virtuals`
      );
    else console.log("tsreader: Schemas found: " + schemaNames);
  }

  return schemaTypes;
}

export const getModelTypes = (modelsPaths: string[], maxCommentDepth = 2): ModelTypes => {
  const project = new Project({});
  project.addSourceFilesAtPaths(modelsPaths);

  let allModelTypes: ModelTypes = {};

  // TODO: ideally we only parse the files that we know have methods, statics, or virtuals.
  // Would save a lot of time
  modelsPaths.forEach(modelPath => {
    const sourceFile = project.getSourceFileOrThrow(modelPath);
    let modelTypes = initModelTypes(sourceFile, modelPath);

    modelTypes = findPropertiesInFile(sourceFile, modelTypes);
    modelTypes = findTypesInFile(sourceFile, modelTypes);
    modelTypes = findCommentsInFile(sourceFile, modelTypes, maxCommentDepth);

    allModelTypes = {
      ...allModelTypes,
      ...modelTypes
    };
  });
  // console.log('ALL MODEL TYPES', allModelTypes);
  return allModelTypes;
};

export const getSchemaTypes = (schemasPaths: string[], maxCommentDepth = 2): ModelTypes => {
  const project = new Project({});
  project.addSourceFilesAtPaths(schemasPaths);

  let allSchemaTypes: ModelTypes = {};

  // TODO: ideally we only parse the files that we know have methods, statics, or virtuals.
  // Would save a lot of time
  schemasPaths.forEach((schemaPath) => {
    const sourceFile = project.getSourceFileOrThrow(schemaPath);
    let modelTypes = initSchemaTypes(sourceFile, schemaPath);

    modelTypes = findPropertiesInFile(sourceFile, modelTypes, _.last(Object.keys(modelTypes)));
    modelTypes = findTypesInFile(sourceFile, modelTypes);
    modelTypes = findCommentsInFile(sourceFile, modelTypes, maxCommentDepth);

    allSchemaTypes = {
      ...allSchemaTypes,
      ...modelTypes
    };
  });

  return allSchemaTypes;
};

export const registerUserTs = (basePath: string): (() => void) | null => {
  let pathToSearch: string;
  if (basePath.endsWith(".json")) pathToSearch = basePath;
  else pathToSearch = path.join(basePath, "**/tsconfig.json");

  const files = glob.sync(pathToSearch, { ignore: "**/node_modules/**" });

  if (files.length === 0) throw new Error(`No tsconfig.json file found at path "${basePath}"`);
  else if (files.length > 1)
    throw new Error(
      `Multiple tsconfig.json files found. Please specify a more specific --project value.\nPaths found: ${files}`
    );

  const foundPath = path.join(process.cwd(), files[0]);
  require("ts-node").register({ transpileOnly: true, project: foundPath });

  // handle path aliases
  const tsConfigString = fs.readFileSync(foundPath, "utf8");

  try {
    const tsConfig = JSON.parse(stripJsonComments(tsConfigString));
    if (tsConfig?.compilerOptions?.paths) {
      const cleanup = require("tsconfig-paths").register({
        baseUrl: process.cwd(),
        paths: tsConfig.compilerOptions.paths
      });

      return cleanup;
    }

    return null;
  } catch {
    throw new Error("Error parsing your tsconfig.json file, please ensure the format is valid");
  }
};

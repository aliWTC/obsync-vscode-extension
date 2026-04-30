"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeFunctions = analyzeFunctions;
const path = __importStar(require("node:path"));
const ts = __importStar(require("typescript"));
const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
function analyzeFunctions(relativePath, contents) {
    const ext = path.extname(relativePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
        return { definitions: [], calls: [] };
    }
    const scriptKind = getScriptKind(ext);
    const sourceFile = ts.createSourceFile(relativePath, contents, ts.ScriptTarget.Latest, true, scriptKind);
    const definitions = [];
    const calls = [];
    const importAliases = collectImportAliases(sourceFile);
    const visit = (node) => {
        const def = tryExtractDefinition(node, sourceFile, relativePath);
        if (def) {
            definitions.push(def);
        }
        if (ts.isCallExpression(node)) {
            const extracted = extractCalleeName(node.expression, importAliases);
            const calleeName = extracted?.calleeName;
            if (calleeName) {
                const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
                if (isLikelyGlobal(calleeName)) {
                    ts.forEachChild(node, visit);
                    return;
                }
                calls.push({
                    relativePath,
                    line: line + 1,
                    calleeName,
                    rawCalleeName: extracted?.rawCalleeName,
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return { definitions, calls };
}
function tryExtractDefinition(node, sourceFile, relativePath) {
    if (ts.isFunctionDeclaration(node) && node.name) {
        return buildDef(node.name.text, "function", node, sourceFile, relativePath);
    }
    if (ts.isMethodDeclaration(node) && node.name) {
        const methodName = getNodeName(node.name);
        if (methodName) {
            const scopedName = getClassScopedMethodName(node, methodName);
            return buildDef(scopedName, "method", node, sourceFile, relativePath);
        }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (ts.isArrowFunction(node.initializer)) {
            return buildDef(node.name.text, "arrow", node, sourceFile, relativePath);
        }
        if (ts.isFunctionExpression(node.initializer)) {
            return buildDef(node.name.text, "functionExpr", node, sourceFile, relativePath);
        }
    }
    return null;
}
function buildDef(name, kind, node, sourceFile, relativePath) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const lineStart = line + 1;
    return {
        id: `${relativePath}::${name}::${lineStart}`,
        name,
        kind,
        relativePath,
        lineStart,
        code: node.getText(sourceFile),
    };
}
function extractCalleeName(expression, importAliases) {
    if (ts.isIdentifier(expression)) {
        const raw = expression.text;
        const normalized = importAliases.get(raw) ?? raw;
        return { calleeName: normalized, rawCalleeName: raw };
    }
    if (ts.isPropertyAccessExpression(expression)) {
        const raw = expression.name.text;
        const base = getPropertyAccessBaseIdentifier(expression.expression);
        if (base && importAliases.has(base)) {
            return { calleeName: raw, rawCalleeName: `${base}.${raw}` };
        }
        return { calleeName: raw, rawCalleeName: raw };
    }
    return null;
}
function collectImportAliases(sourceFile) {
    const aliases = new Map();
    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) || !statement.importClause) {
            continue;
        }
        const clause = statement.importClause;
        if (clause.name) {
            aliases.set(clause.name.text, clause.name.text);
        }
        if (!clause.namedBindings) {
            continue;
        }
        if (ts.isNamespaceImport(clause.namedBindings)) {
            aliases.set(clause.namedBindings.name.text, clause.namedBindings.name.text);
            continue;
        }
        for (const element of clause.namedBindings.elements) {
            const importedName = element.propertyName?.text ?? element.name.text;
            aliases.set(element.name.text, importedName);
        }
    }
    return aliases;
}
function getPropertyAccessBaseIdentifier(expression) {
    if (ts.isIdentifier(expression)) {
        return expression.text;
    }
    if (ts.isPropertyAccessExpression(expression)) {
        return getPropertyAccessBaseIdentifier(expression.expression);
    }
    return null;
}
function getClassScopedMethodName(node, methodName) {
    const classLike = node.parent;
    if (classLike &&
        (ts.isClassDeclaration(classLike) || ts.isClassExpression(classLike)) &&
        classLike.name) {
        return `${classLike.name.text}.${methodName}`;
    }
    return methodName;
}
function isLikelyGlobal(calleeName) {
    const globals = new Set([
        "console",
        "setTimeout",
        "setInterval",
        "clearTimeout",
        "clearInterval",
        "Promise",
        "Math",
        "JSON",
        "Object",
        "Array",
    ]);
    return globals.has(calleeName);
}
function getNodeName(name) {
    if (ts.isIdentifier(name)) {
        return name.text;
    }
    if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }
    return null;
}
function getScriptKind(ext) {
    switch (ext) {
        case ".tsx":
            return ts.ScriptKind.TSX;
        case ".jsx":
            return ts.ScriptKind.JSX;
        case ".js":
        case ".mjs":
        case ".cjs":
            return ts.ScriptKind.JS;
        default:
            return ts.ScriptKind.TS;
    }
}
//# sourceMappingURL=functionAnalyzer.js.map
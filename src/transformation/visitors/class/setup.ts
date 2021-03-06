import * as ts from "typescript";
import * as lua from "../../../LuaAST";
import { TransformationContext } from "../../context";
import { UndefinedTypeNode } from "../../utils/errors";
import {
    createDefaultExportStringLiteral,
    createExportedIdentifier,
    getIdentifierExportScope,
    hasDefaultExportModifier,
} from "../../utils/export";
import { createExportsIdentifier, createLocalOrExportedOrGlobalDeclaration } from "../../utils/lua-ast";
import { LuaLibFeature, transformLuaLibFunction } from "../../utils/lualib";
import { getExtendedNode, getExtendsClause } from "./utils";

export function createClassSetup(
    context: TransformationContext,
    statement: ts.ClassLikeDeclarationBase,
    className: lua.Identifier,
    localClassName: lua.Identifier,
    classNameText: string,
    extendsType?: ts.Type
): lua.Statement[] {
    const result: lua.Statement[] = [];

    // __TS__Class()
    const classInitializer = transformLuaLibFunction(context, LuaLibFeature.Class, statement);

    const defaultExportLeftHandSide = hasDefaultExportModifier(statement)
        ? lua.createTableIndexExpression(createExportsIdentifier(), createDefaultExportStringLiteral(statement))
        : undefined;

    // [____exports.]className = __TS__Class()
    if (defaultExportLeftHandSide) {
        result.push(lua.createAssignmentStatement(defaultExportLeftHandSide, classInitializer, statement));
    } else {
        result.push(...createLocalOrExportedOrGlobalDeclaration(context, className, classInitializer, statement));
    }

    if (defaultExportLeftHandSide) {
        // local localClassName = ____exports.default
        result.push(lua.createVariableDeclarationStatement(localClassName, defaultExportLeftHandSide));
    } else {
        const exportScope = getIdentifierExportScope(context, className);
        if (exportScope) {
            // local localClassName = ____exports.className
            result.push(
                lua.createVariableDeclarationStatement(
                    localClassName,
                    createExportedIdentifier(context, lua.cloneIdentifier(className), exportScope)
                )
            );
        }
    }

    // localClassName.name = className
    result.push(
        lua.createAssignmentStatement(
            lua.createTableIndexExpression(lua.cloneIdentifier(localClassName), lua.createStringLiteral("name")),
            lua.createStringLiteral(classNameText),
            statement
        )
    );

    if (extendsType) {
        const extendedNode = getExtendedNode(context, statement);
        if (extendedNode === undefined) {
            throw UndefinedTypeNode(statement);
        }

        result.push(
            lua.createExpressionStatement(
                transformLuaLibFunction(
                    context,
                    LuaLibFeature.ClassExtends,
                    getExtendsClause(statement),
                    lua.cloneIdentifier(localClassName),
                    context.transformExpression(extendedNode.expression)
                )
            )
        );
    }

    return result;
}

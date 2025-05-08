// openapi-tools.ts

import { OpenAPIV3 } from 'openapi-types';
import axios from "axios";
import { readFile } from 'fs/promises';

/**
 * 工具接口定义
 */
export interface Tool {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}

/**
 * OpenAPI工具解析器类
 */
export class OpenAPIToolsParser {
    /**
     * 从OpenAPI规范加载并解析工具定义
     * @param config 包含openApiSpec的配置对象
     * @returns 解析出的工具集合，以工具ID为键
     */
    public static async loadAndParseOpenAPISpec(config: { openApiSpec: string | OpenAPIV3.Document }): Promise<Map<string, Tool>> {
        const tools = new Map<string, Tool>();

        // 加载OpenAPI规范
        let spec: OpenAPIV3.Document;

        if (typeof config.openApiSpec === "string") {
            if (config.openApiSpec.startsWith("http")) {
                // Load from URL
                const response = await axios.get(config.openApiSpec);
                spec = response.data;
            } else {
                // Load from local file
                try {
                    // 方法1: 使用 fs/promises 的 readFile (推荐)
                    const content = await readFile(config.openApiSpec, "utf-8");
                    spec = JSON.parse(content);
                } catch (error) {
                    // @ts-ignore
                    throw new Error(`Failed to parse OpenAPI spec: ${error.message}`);
                }
            }
        }


        // 解析OpenAPI规范
        // @ts-ignore
        const info = spec.info.description || "No description available";

        // 将每个OpenAPI路径转换为工具
        // @ts-ignore
        for (const [path, pathItem] of Object.entries(spec.paths)) {
            if (!pathItem) continue;

            for (const [method, operation] of Object.entries(pathItem)) {
                if (method === "parameters" || !operation) continue;

                const op = operation as OpenAPIV3.OperationObject;
                const cleanPath = path.replace(/^\//, "");
                const toolId = `${method.toUpperCase()}-${cleanPath}`.replace(
                    /[^a-zA-Z0-9-]/g,
                    "-",
                );

                const tool: Tool = {
                    name: op.operationId || op.summary || `${method.toUpperCase()} ${path}`,
                    description: this.extractAllDescriptions(op, info),
                    inputSchema: {
                        type: "object",
                        properties: {},
                        required: undefined
                    },
                };

                // 记录工具注册信息
                console.log(`Registering tool: ${toolId} (${tool.name})`);

                // 添加操作中的参数
                if (op.parameters) {
                    for (const param of op.parameters) {
                        if ("name" in param && "in" in param) {
                            const paramSchema = param.schema as OpenAPIV3.SchemaObject;
                            tool.inputSchema.properties[param.name] = {
                                type: paramSchema?.type || "string",
                                description: param.description || `${param.name} parameter`,
                            };

                            if (param.required) {
                                tool.inputSchema.required = tool.inputSchema.required || [];
                                tool.inputSchema.required.push(param.name);
                            }
                        }
                    }
                }

                // 处理请求体
                if (op.requestBody) {
                    const requestBody = op.requestBody as OpenAPIV3.RequestBodyObject;
                    if (requestBody.content) {
                        // 优先使用 application/json
                        const jsonContent = requestBody.content['application/json'];
                        if (jsonContent && jsonContent.schema) {
                            const schema = jsonContent.schema as OpenAPIV3.SchemaObject;
                            if (schema.properties) {
                                for (const [propName, propSchema] of Object.entries(schema.properties)) {
                                    const propSchemaObj = propSchema as OpenAPIV3.SchemaObject;
                                    tool.inputSchema.properties[propName] = {
                                        type: propSchemaObj.type || "string",
                                        description: propSchemaObj.description || `${propName} property`,
                                    };
                                }
                            }

                            if (schema.required) {
                                tool.inputSchema.required = tool.inputSchema.required || [];
                                tool.inputSchema.required = [...tool.inputSchema.required, ...schema.required];
                            }
                        }
                    }
                }

                tools.set(toolId, tool);
            }
        }

        return tools;
    }

    /**
     * 递归解析 OpenAPI 操作对象中所有 schema 和 properties 的 description
     * @param operation OpenAPI 操作对象
     * @param info API信息描述
     * @returns 拼接后的所有 description
     */
    private static extractAllDescriptions(operation: OpenAPIV3.OperationObject, info: string): string {
        let result: string[] = [];

        // 添加头部的prompt
        if (info) {
            result.push(`Prompt: ${info}`);
        }

        // 添加操作本身的描述
        if (operation.description) {
            result.push(`Operation: ${operation.description}`);
        } else if (operation.summary) {
            result.push(`Operation: ${operation.summary}`);
        }

        // 处理请求体
        if (operation.requestBody) {
            const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
            if (requestBody.description) {
                result.push(`Request Body: ${requestBody.description}`);
            }

            // 处理请求体中的内容
            if (requestBody.content) {
                for (const [mediaType, mediaTypeObject] of Object.entries(requestBody.content)) {
                    if (mediaTypeObject.schema) {
                        const schemaDescriptions = this.extractSchemaDescriptions(
                            mediaTypeObject.schema,
                            `Request (${mediaType})`
                        );
                        result = result.concat(schemaDescriptions);
                    }
                }
            }
        }

        // 处理响应
        if (operation.responses) {
            for (const [statusCode, response] of Object.entries(operation.responses)) {
                const responseObj = response as OpenAPIV3.ResponseObject;
                if (responseObj.description) {
                    result.push(`Response ${statusCode}: ${responseObj.description}`);
                }

                // 处理响应中的内容
                if (responseObj.content) {
                    for (const [mediaType, mediaTypeObject] of Object.entries(responseObj.content)) {
                        if (mediaTypeObject.schema) {
                            const schemaDescriptions = this.extractSchemaDescriptions(
                                mediaTypeObject.schema,
                                `Response ${statusCode} (${mediaType})`
                            );
                            result = result.concat(schemaDescriptions);
                        }
                    }
                }
            }
        }

        // 处理参数
        if (operation.parameters) {
            for (const parameter of operation.parameters) {
                const paramObj = parameter as OpenAPIV3.ParameterObject;
                if (paramObj.description) {
                    result.push(`Parameter ${paramObj.name}: ${paramObj.description}`);
                }

                if (paramObj.schema) {
                    const schemaDescriptions = this.extractSchemaDescriptions(
                        paramObj.schema,
                        `Parameter ${paramObj.name}`
                    );
                    result = result.concat(schemaDescriptions);
                }
            }
        }

        return result.join('\n\n');
    }

    /**
     * 递归提取 Schema 中的所有描述
     * @param schema Schema 对象
     * @param prefix 描述前缀
     * @param path 当前属性路径
     * @returns 描述数组
     */
    private static extractSchemaDescriptions(
        schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
        prefix: string = '',
        path: string = ''
    ): string[] {
        const descriptions: string[] = [];

        // 处理引用对象
        if ('$ref' in schema) {
            descriptions.push(`${prefix}${path ? ' > ' + path : ''}: Reference to ${schema.$ref}`);
            return descriptions;
        }

        // 处理 schema 对象
        const schemaObj = schema as OpenAPIV3.SchemaObject;

        // 添加当前 schema 的描述
        if (schemaObj.description && path) {
            descriptions.push(`${prefix}${path}: ${schemaObj.description}`);
        }

        // 处理对象类型的 properties
        if (schemaObj.properties) {
            for (const [propName, propSchema] of Object.entries(schemaObj.properties)) {
                const newPath = path ? `${path}.${propName}` : propName;
                const propDescriptions = this.extractSchemaDescriptions(propSchema, prefix, newPath);
                descriptions.push(...propDescriptions);
            }
        }

        // 处理数组类型
        if (schemaObj.type === 'array' && schemaObj.items) {
            const newPath = path ? `${path}[]` : '[]';
            const itemDescriptions = this.extractSchemaDescriptions(schemaObj.items, prefix, newPath);
            descriptions.push(...itemDescriptions);
        }

        // 处理 allOf, anyOf, oneOf
        ['allOf', 'anyOf', 'oneOf'].forEach(combiner => {
            const combiners = schemaObj[combiner as keyof OpenAPIV3.SchemaObject];
            if (combiners) {
                const schemas = combiners as (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[];
                schemas.forEach((subSchema, index) => {
                    const newPath = path ? `${path} (${combiner}[${index}])` : `${combiner}[${index}]`;
                    const subDescriptions = this.extractSchemaDescriptions(subSchema, prefix, newPath);
                    descriptions.push(...subDescriptions);
                });
            }
        });

        return descriptions;
    }
}

// 导出便捷函数，方便直接调用
export async function loadAndParseOpenAPISpec(
    config: { openApiSpec: string | OpenAPIV3.Document }
): Promise<Map<string, Tool>> {
    return OpenAPIToolsParser.loadAndParseOpenAPISpec(config);
}

// 导出类型和接口
export type { OpenAPIV3 };

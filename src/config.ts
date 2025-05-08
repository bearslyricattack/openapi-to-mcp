// config-loader.ts

import { OpenAPIV3 } from 'openapi-types';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

/**
 * OpenAPI MCP 服务器配置接口
 */
export interface OpenAPIMCPServerConfig {
    /** 服务名称 */
    name: string;
    /** API 基础 URL */
    apiBaseUrl: string;
    /** OpenAPI 规范文档或路径 */
    openApiSpec: OpenAPIV3.Document | string;
    /** API 请求头 */
    headers?: Record<string, string>;
}

/**
 * 配置加载器类
 */
export class ConfigLoader {
    /**
     * 从命令行参数和环境变量加载配置
     * @returns 服务器配置对象
     */
    public static loadConfig(): OpenAPIMCPServerConfig {
        const args = yargs(hideBin(process.argv))
            .option("name", {
                type: "string",
                default: "mcp-openapi-server",
                description: "Server name"
            })
            .option("api-base-url", {
                type: "string",
                description: "Base URL for the API"
            })
            .option("openapi-spec", {
                type: "string",
                description: "Path to OpenAPI specification file or URL"
            })
            .option("headers", {
                type: "string",
                description: "API headers in format 'key1:value1,key2:value2'"
            })
            .help()
            .parseSync();

        // 解析头信息
        const headers: Record<string, string> = {};
        const headersStr = args.headers as string || process.env.API_HEADERS;
        if (headersStr) {
            headersStr.split(',').forEach(pair => {
                const [key, value] = pair.split(':').map(s => s.trim());
                if (key && value) {
                    headers[key] = value;
                }
            });
        }

        // 获取配置值
        const name = args.name as string || process.env.SERVER_NAME || "mcp-openapi-server";
        const apiBaseUrl = args["api-base-url"] as string || process.env.API_BASE_URL || "http://localhost:8080";
        const openApiSpec = args["openapi-spec"] as string || process.env.OPENAPI_SPEC || "./openapi.json";

        return {
            name,
            apiBaseUrl,
            openApiSpec,
            headers: Object.keys(headers).length > 0 ? headers : {}
        };
    }

    /**
     * 从指定的配置对象加载配置
     * @param config 部分配置对象
     * @returns 完整的配置对象，使用默认值填充缺失的属性
     */
    public static loadFromObject(config: Partial<OpenAPIMCPServerConfig>): OpenAPIMCPServerConfig {
        // 获取默认配置
        const defaultConfig = this.getDefaultConfig();

        // 合并配置
        return {
            ...defaultConfig,
            ...config,
            // 确保 headers 正确合并
            headers: {
                ...defaultConfig.headers,
                ...(config.headers || {})
            }
        };
    }

    /**
     * 获取默认配置
     * @returns 默认配置对象
     */
    private static getDefaultConfig(): OpenAPIMCPServerConfig {
        return {
            name: "mcp-openapi-server",
            apiBaseUrl: "http://localhost:8080",
            openApiSpec: "./openapi.json",
            headers: {}
        };
    }
}

/**
 * 从命令行参数和环境变量加载配置的便捷函数
 * @returns 服务器配置对象
 */
export function loadConfig(): OpenAPIMCPServerConfig {
    return ConfigLoader.loadConfig();
}

/**
 * 从配置对象加载配置的便捷函数
 * @param config 部分配置对象
 * @returns 完整的配置对象
 */
export function loadConfigFromObject(config: Partial<OpenAPIMCPServerConfig>): OpenAPIMCPServerConfig {
    return ConfigLoader.loadFromObject(config);
}

// 导出类型
export type { OpenAPIV3 };

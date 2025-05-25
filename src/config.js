// config-loader.ts
import yargs from 'yargs';
import * as fs from 'fs';
import * as path from 'path';
/**
 * 配置加载器类
 */
export class ConfigLoader {
    /**
     * 从命令行参数和环境变量加载配置
     * @returns 多服务器配置对象
     */
    static loadConfig() {
        // 支持单连字符和双连字符参数
        const rawArgs = process.argv.slice(2);
        const processedArgs = [];
        for (let i = 0; i < rawArgs.length; i++) {
            const arg = rawArgs[i];
            // 将单连字符参数转换为双连字符参数
            if (arg.startsWith('-') && !arg.startsWith('--')) {
                processedArgs.push(`-${arg}`);
            }
            else {
                processedArgs.push(arg);
            }
        }
        const args = yargs(processedArgs)
            .option("config", {
            type: "string",
            alias: "c",
            description: "Path to JSON configuration file containing server configurations"
        })
            .option("servers", {
            type: "string",
            alias: "s",
            description: "JSON string representing server configurations"
        })
            .help()
            .parseSync();
        console.log("Command line arguments:", args);
        let servers = [];
        // 尝试从配置文件加载
        if (args.config) {
            try {
                const configPath = path.resolve(args.config);
                console.log(`Loading config from: ${configPath}`);
                if (!fs.existsSync(configPath)) {
                    throw new Error(`Config file not found: ${configPath}`);
                }
                const configData = fs.readFileSync(configPath, 'utf8');
                const parsedConfig = JSON.parse(configData);
                console.log("Parsed config:", parsedConfig);
                if (parsedConfig.servers && Array.isArray(parsedConfig.servers)) {
                    servers = parsedConfig.servers;
                }
                else {
                    servers = [parsedConfig];
                }
            }
            catch (error) {
                console.error(`Error loading config file: ${error}`);
                // 在出错时继续使用默认配置
            }
        }
        // 尝试从命令行JSON字符串加载
        else if (args.servers) {
            try {
                const parsedServers = JSON.parse(args.servers);
                servers = Array.isArray(parsedServers) ? parsedServers : [parsedServers];
            }
            catch (error) {
                console.error(`Error parsing servers JSON: ${error}`);
            }
        }
        // 尝试从环境变量加载
        else if (process.env.SERVER_CONFIG) {
            try {
                const parsedConfig = JSON.parse(process.env.SERVER_CONFIG);
                servers = Array.isArray(parsedConfig.servers)
                    ? parsedConfig.servers
                    : [parsedConfig];
            }
            catch (error) {
                console.error(`Error parsing environment config: ${error}`);
            }
        }
        // 如果没有配置，使用默认配置
        if (servers.length === 0) {
            servers = [this.getDefaultConfig()];
        }
        // 处理每个服务器配置，确保所有必要的字段都有值
        servers = servers.map(server => this.loadFromObject(server));
        // 处理OpenAPI规范路径
        servers = servers.map(server => {
            if (typeof server.openApiSpec === 'string' && !server.openApiSpec.startsWith('http')) {
                // 转换相对路径为绝对路径
                server.openApiSpec = path.resolve(process.cwd(), server.openApiSpec);
            }
            return server;
        });
        return { servers };
    }
    /**
     * 从指定的配置对象加载配置
     * @param config 部分配置对象
     * @returns 完整的配置对象，使用默认值填充缺失的属性
     */
    static loadFromObject(config) {
        // 获取默认配置
        const defaultConfig = this.getDefaultConfig();
        // 解析头信息（如果是字符串格式）
        let headers = config.headers || {};
        if (typeof headers === 'string') {
            const parsedHeaders = {};
            headers.split(',').forEach(pair => {
                const [key, value] = pair.split(':').map(s => s.trim());
                if (key && value) {
                    parsedHeaders[key] = value;
                }
            });
            headers = parsedHeaders;
        }
        // 合并配置
        return {
            ...defaultConfig,
            ...config,
            // 确保 headers 正确合并
            headers: {
                ...defaultConfig.headers,
                ...(typeof headers === 'object' ? headers : {})
            }
        };
    }
    /**
     * 获取默认配置
     * @returns 默认配置对象
     */
    static getDefaultConfig() {
        return {
            name: "mcp-openapi-server",
            apiBaseUrl: "http://localhost:8080",
            openApiSpec: "./openapi.json",
            headers: {},
            mode: "stdio",
        };
    }
}
/**
 * 从命令行参数和环境变量加载配置的便捷函数
 * @returns 多服务器配置对象
 */
export function loadConfig() {
    return ConfigLoader.loadConfig();
}
/**
 * 从配置对象加载单个服务器配置的便捷函数
 * @param config 部分配置对象
 * @returns 完整的配置对象
 */
export function loadConfigFromObject(config) {
    return ConfigLoader.loadFromObject(config);
}
/**
 * 从配置对象加载多服务器配置的便捷函数
 * @param configs 部分配置对象数组
 * @returns 多服务器配置对象
 */
export function loadMultiConfigFromObjects(configs) {
    const servers = configs.map(config => ConfigLoader.loadFromObject(config));
    return { servers };
}

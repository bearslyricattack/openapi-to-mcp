import axios from 'axios';
/**
 * 执行HTTP请求并将结果转换为MCP格式
 * @param toolId 工具ID
 * @param toolName 工具名称
 * @param params 请求参数
 * @param apiBaseUrl API基础URL
 * @param headers 请求头
 * @returns MCP格式的响应内容
 */
export async function executeHttpRequest(toolId, toolName, params, apiBaseUrl, headers = {}) {
    console.error(`Executing tool: ${toolId} (${toolName})`);
    try {
        // 从工具ID提取HTTP方法和路径
        const [method, ...pathParts] = toolId.split("-");
        const path = "/" + pathParts.join("/").replace(/-/g, "/");
        // 确保基本URL以斜杠结尾以便正确连接
        const baseUrl = apiBaseUrl.endsWith("/")
            ? apiBaseUrl
            : `${apiBaseUrl}/`;
        // 删除路径开头的斜杠以避免双斜杠
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        // 构造完整URL
        const url = new URL(cleanPath, baseUrl).toString();
        // 准备请求配置
        const config = {
            method: method.toLowerCase(),
            url: url,
            headers: headers,
        };
        // 根据HTTP方法处理不同的参数类型
        if (method.toLowerCase() === "get") {
            // 对于GET请求，确保参数结构正确
            if (params && typeof params === "object") {
                // 正确处理数组参数
                const queryParams = {};
                for (const [key, value] of Object.entries(params)) {
                    if (Array.isArray(value)) {
                        // 用逗号连接数组值作为查询参数
                        queryParams[key] = value.join(",");
                    }
                    else if (value !== undefined && value !== null) {
                        // 将其他值转换为字符串
                        queryParams[key] = String(value);
                    }
                }
                config.params = queryParams;
            }
        }
        else {
            // 对于POST, PUT, PATCH - 作为主体发送
            config.data = params;
        }
        console.error(`Processed parameters:`, config.params || config.data);
        console.error("Final request config:", config);
        // 执行HTTP请求
        const response = await axios(config);
        console.error("Response status:", response.status);
        console.error("Response headers:", response.headers);
        console.error("Response data:", response.data);
        // 将API响应作为MCP内容返回
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify(response.data, null, 2)
                }]
        };
    }
    catch (error) {
        if (axios.isAxiosError(error)) {
            console.error("Request failed:", {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                headers: error.response?.headers,
            });
            throw new Error(`API request failed: ${error.message} - ${JSON.stringify(error.response?.data)}`);
        }
        throw error;
    }
}

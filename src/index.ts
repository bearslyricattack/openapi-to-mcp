import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod";
import {loadConfig} from "./config.js";
import {OpenAPIToolsParser} from "./openapi.js";
import {executeHttpRequest} from "./httprequest.js"

const multiConfig = loadConfig();
console.log("Loaded server configurations:", multiConfig);
const app = express();
app.use(express.json());

app.get('/mcp-servers', (req, res) => {
  try {
    const mcpServers = {};
    for (const config of multiConfig.servers) {
      // 使用配置对象中的 name 作为键
      const serverName = config.name;

      // 如果没有名称，可以跳过此配置或使用某种默认值
      if (!serverName) {
        console.warn('Skipping server config without a name:', config);
        continue;
      }

      // 使用指定格式创建结构体
      // @ts-ignore
      mcpServers[serverName] = {
        isActive: true,
        name: config.name,
        type: 'streamableHttp',
        description: config.name|| '',
        baseUrl: config.apiBaseUrl || ''
      };
    }
    // 返回包含所有服务器配置的对象
    res.status(200).json({ mcpServers });
  } catch (error) {
    console.error('Error retrieving MCP server configurations:', error);
    res.status(500).json({ error: 'Failed to retrieve server configurations' });
  }
});


// 处理每个服务器配置
for (const config of multiConfig.servers) {
  console.log(`Processing server: ${config.name}`);
  console.log(`Parsing OpenAPI spec: ${config.openApiSpec}`);

  const tools = await OpenAPIToolsParser.loadAndParseOpenAPISpec({
    openApiSpec: config.openApiSpec
  });
  console.log(`Found ${tools.size} tools:`);
  tools.forEach((tool, id) => {
    console.log(`Tool ID: ${id}`);
    console.log(`Name: ${tool.name}`);
    console.log(`Description: ${tool.description.substring(0, 100)}...`);
    console.log('---');
  })

  if (config.mode == "http"){
    const path = `/${config.name}/mcp`;
    console.log({
      message: "Created HTTP path",
      path: path,
      serverName: config.name,
      serverMode: config.mode,
      apiBaseUrl: config.apiBaseUrl
    });
// Map to store transports by session ID
    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
// Handle POST requests for client-to-server communication
    app.post(path, async (req, res) => {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            // Store the transport by session ID
            transports[sessionId] = transport;
          }
        });
        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };
        const server = new McpServer({
          name: config.name,
          version: "1.0.0"
        });
        tools.forEach((tool, id) => {
          const zodProperties = convertToZodProperties(tool.inputSchema);
          server.tool(
              tool.name,
              tool.description,
              zodProperties,
              async (params) => {
                const createUserResult = await executeHttpRequest(
                    id,
                    tool.name,
                    params,
                    config.apiBaseUrl,
                    config.headers
                );
                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify(createUserResult)
                  }]
                };
              }
          );
        });
        // Connect to the MCP server
        await server.connect(transport);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }
      // Handle the request
      await transport.handleRequest(req, res, req.body);
    });
// Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (req: express.Request, res: express.Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    };
// Handle GET requests for server-to-client notifications via SSE
    app.get(path, handleSessionRequest);
// Handle DELETE requests for session termination
    app.delete(path, handleSessionRequest);
  }
  if (config.mode == "stdio"){
    const server = new McpServer({
      name: config.name,
      version: "1.0.0"
    });

    tools.forEach((tool, id) => {
      const zodProperties = convertToZodProperties(tool.inputSchema);
      server.tool(
          tool.name,
          tool.description,
          zodProperties,
          async (params) => {
            const createUserResult = await executeHttpRequest(
                id,
                tool.name,
                params,
                config.apiBaseUrl,
                config.headers
            );
            return {
              content: [{
                type: "text",
                text: JSON.stringify(createUserResult)
              }]
            };
          }
      );
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
app.listen(3001);


function convertToZodProperties(schema: {
  type: string;
  properties: Record<string, any>;
  required?: string[];
}): z.ZodRawShape {
  const zodProperties: z.ZodRawShape = {};

  // 遍历属性并转换为对应的 Zod 类型
  for (const [key, prop] of Object.entries(schema.properties)) {
    switch (prop.type) {
      case 'string':
        zodProperties[key] = z.string();
        break;
      case 'number':
        zodProperties[key] = z.number();
        break;
      case 'boolean':
        zodProperties[key] = z.boolean();
        break;
      case 'integer':
        zodProperties[key] = z.number().int();
      default:
        zodProperties[key] = z.any();
    }

    if (!schema.required?.includes(key)) {
      zodProperties[key] = zodProperties[key].optional();
    }
  }

  return zodProperties;
}
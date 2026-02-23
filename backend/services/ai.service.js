const OpenAI = require("openai");
const env = require("../config/env");
const logger = require("../utils/logger");
const { tools } = require("./agent.tools");
const { Farm, Device, FarmDevice } = require("../models");

class AIService {
  constructor() {
    if (!env.OPENAI_API_KEY) {
      logger.warn("OPENAI_API_KEY not set");
      this.openai = null;
      return;
    }

    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async generateResponse(userMessage, sensorData = [], options = {}) {
    if (!this.openai)
      return "AI disabled.";

    const { farmId } = options;
    const toolDefinitions = tools.map(t => t.definition);

    // Fetch farm context if available
    let farmContext = "";
    if (farmId) {
      try {
        const farm = await Farm.findByPk(farmId, {
          include: [{ model: Device, attributes: ["id", "device_name", "location"] }]
        });
        if (farm) {
          const deviceList = farm.Devices.map(d => `  - ${d.device_name || 'Unnamed'} (${d.id}) — ${d.location || 'No location'}`).join('\n');
          farmContext = `\nCurrent Context:\n- This WhatsApp is connected to farm: "${farm.name}" (ID: ${farm.id})\n- Devices on this farm:\n${deviceList}`;
        }
      } catch (err) {
        logger.error('Failed to fetch farm context', { error: err.message });
        farmContext = `\nCurrent Context:\n- Farm ID: ${farmId}`;
      }
    }

    const systemContent = `
You are a WhatsApp-based farm automation assistant.

System Model:
- Each user belongs to specific farms.
- Each farm has multiple IoT devices.
- Each device:
  - Reports temperature, humidity, and soil moisture every 5 seconds.
  - Controls its own irrigation pump independently.
${farmContext}

Operational Rules:
- Every irrigation command MUST target a specific farm and device.
- Never assume a default farm or device.
- If the user belongs to multiple farms, ask which farm.
- If the farm has multiple devices, ask which device.
- Confirm pump state changes after executing commands.
- If the device is offline, inform the user immediately.
- Be concise and practical (WhatsApp style).

You must call tools when:
- Fetching latest sensor data for a device
- Starting pump for a device
- Stopping pump for a device
- Checking pump status for a device
`;

    const messages = [
      { role: "system", content: systemContent },
      { role: "user", content: userMessage }
    ];

    const response = await this.openai.chat.completions.create({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      tools: toolDefinitions,
      tool_choice: "auto"
    });

    const message = response.choices[0].message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      // Handle ALL tool calls (not just the first one)
      const toolMessages = [];
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        const tool = tools.find(t => t.definition.function.name === toolName);
        if (!tool) {
          toolMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `Tool ${toolName} not found` })
          });
          continue;
        }

        try {
          const toolResult = await tool.handler(args);
          toolMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          });
        } catch (err) {
          logger.error(`Tool ${toolName} failed`, { error: err.message });
          toolMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: err.message })
          });
        }
      }

      const finalResponse = await this.openai.chat.completions.create({
        model: env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "Summarize the tool results concisely for WhatsApp. Use emojis where appropriate." },
          { role: "user", content: userMessage },
          message,
          ...toolMessages
        ]
      });

      return finalResponse.choices[0].message.content;
    }

    return message.content;
  }
}

module.exports = new AIService();
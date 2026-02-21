const OpenAI = require("openai");
const env = require("../config/env");
const logger = require("../utils/logger");
const { tools } = require("./agent.tools");

class AIService {
  constructor() {
    if (!env.OPENAI_API_KEY) {
      logger.warn("OPENAI_API_KEY not set");
      this.openai = null;
      return;
    }

    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async generateResponse(userMessage) {
    if (!this.openai)
      return "AI disabled.";

    const toolDefinitions = tools.map(t => t.definition);

    const response = await this.openai.chat.completions.create({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a smart irrigation assistant. " +
            "When users request farm data, call the tool. " +
            "For unrelated queries respond: not in context."
        },
        { role: "user", content: userMessage }
      ],
      tools: toolDefinitions,
      tool_choice: "auto"
    });

    const message = response.choices[0].message;

    if (message.tool_calls) {
      const toolCall = message.tool_calls[0];
      const toolName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      const tool = tools.find(t => t.definition.function.name === toolName);
      
      if (!tool) {
        throw new Error(`Tool ${toolName} not found`);
      }

      const toolResult = await tool.handler(args);

      const finalResponse = await this.openai.chat.completions.create({
        model: env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "Answer strictly from tool data." },
          { role: "user", content: userMessage },
          message,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          }
        ]
      });

      return finalResponse.choices[0].message.content;
    }

    return message.content;
  }
}

module.exports = new AIService();
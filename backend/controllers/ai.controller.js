const aiService = require('../services/ai.service');
const asyncHandler = require('../utils/asyncHandler');

const queryTimeSeries = asyncHandler(async (req, res) => {
  const { question, farm_id, session_id } = req.validatedBody;

  try {
    const result = await aiService.answerInfluxQuestion(question, {
      farmId: farm_id,
      conversationId: session_id || req.ip,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.statusCode || 400;
    return res.status(status).json({
      error: error.message || 'Failed to process AI query',
    });
  }
});

module.exports = {
  queryTimeSeries,
};

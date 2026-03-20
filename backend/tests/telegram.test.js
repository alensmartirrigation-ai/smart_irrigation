const test = require('node:test');
const assert = require('node:assert');
const telegramService = require('../services/telegram.service');

test('Telegram webhook secret validator', (t) => {
    // Disable secret for a moment
    const oldSecret = telegramService.webhookSecret;
    
    telegramService.webhookSecret = 'my-secret';
    
    const validReq = { headers: { 'x-telegram-bot-api-secret-token': 'my-secret' } };
    const invalidReq = { headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret' } };
    const missingReq = { headers: {} };

    assert.strictEqual(telegramService.validateWebhookSecret(validReq), true);
    assert.strictEqual(telegramService.validateWebhookSecret(invalidReq), false);
    assert.strictEqual(telegramService.validateWebhookSecret(missingReq), false);

    // If no secret configured, all should pass
    telegramService.webhookSecret = undefined;
    assert.strictEqual(telegramService.validateWebhookSecret(validReq), true);
    assert.strictEqual(telegramService.validateWebhookSecret(invalidReq), true);

    telegramService.webhookSecret = oldSecret;
});

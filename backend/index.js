const express = require('express');
const app = express();
const { generateText, generateImage } = require('./gptunnel');

app.get('/test-text', async (req, res) => {
  try {
    const result = await generateText('Скажи привет одним словом');
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/test-image', async (req, res) => {
  try {
    const result = await generateImage('милый кот в стиле акварели');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/list-models', async (req, res) => {
  try {
    const { listModels } = require('./gptunnel');
    const result = await listModels();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/check-image/:id', async (req, res) => {
  try {
    const { checkImage } = require('./gptunnel');
    const result = await checkImage(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
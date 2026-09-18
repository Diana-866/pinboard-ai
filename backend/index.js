const express = require('express');
const app = express();
const { generateText, generateImage } = require('./gptunnel');
const { register, login, verifyToken } = require('./auth');
const supabase = require('./supabase');

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

app.use(express.json());

app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await register(email, password);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error('Нет токена');

    const decoded = verifyToken(authHeader);

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, credits_balance, subscription_tier')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) throw new Error('Пользователь не найден');

    res.json(user);
  } catch (e) {
    res.status(401).json({ error: e.message });
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
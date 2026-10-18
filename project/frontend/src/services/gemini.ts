import { GoogleGenAI } from '@google/genai';

export type SupportedAspectRatio = '2:3' | '3:4' | '9:16' | '1:1' | '4:5';

export interface GeneratedPinVariation {
  id: string;
  titles: string[];
  selectedTitle: string;
  description: string;
  altText: string;
  suggestedBoard: string;
  keywords: string[];
  headlineOverlay: string;
  subheadlineOverlay: string;
  ctaText: string;
  imageUrl: string;
  tone: string;
  aspectRatio: SupportedAspectRatio;
}

export interface PinGenerationRequest {
  topic: string;
  tone: string;
  targetBoard: string;
  contentLanguage: string;
  count: number;
  customUrl?: string;
  aspectRatios?: SupportedAspectRatio[];
}

const SAMPLE_IMAGES = [
  '/src/assets/images/pin_home_decor_1790670043705.jpg',
  '/src/assets/images/pin_matcha_latte_1790670057380.jpg',
  '/src/assets/images/pin_skincare_routine_1790670067721.jpg',
  '/src/assets/images/pin_travel_amalfi_1790670078173.jpg',
];

export async function generatePinterestPinBatch(
  request: PinGenerationRequest
): Promise<GeneratedPinVariation[]> {
  const { topic, tone, targetBoard, contentLanguage, count, customUrl } = request;

  const apiKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || '';

  // Try real Gemini API if available
  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are PinSprig's expert Pinterest SEO and visual content strategist.
Task: Generate ${count} distinct Pinterest Pin variations for the topic: "${topic}".
Tone: ${tone}.
Target Board: "${targetBoard}".
Output Language: Must be written entirely in "${contentLanguage}" language.

For EACH of the ${count} pins, output valid JSON conforming strictly to this format:
[
  {
    "titles": ["Curiosity Hook Title", "SEO Keyword Title", "Benefit-Driven Title"],
    "selectedTitle": "Best primary title",
    "description": "Engaging Pinterest SEO description with natural keyword integration, 200-350 characters, and 3-5 relevant hashtags.",
    "altText": "Descriptive visual alt-text for accessibility and search indexing.",
    "headlineOverlay": "Short 3-6 word punchy text for on-pin graphic",
    "subheadlineOverlay": "Secondary insight or benefit",
    "ctaText": "Call to action on pin (e.g. Save for later, Tap to read)",
    "keywords": ["keyword 1", "keyword 2", "keyword 3", "keyword 4"]
  }
]
Return ONLY raw JSON without markdown code fences if possible.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const responseText = response.text?.trim() || '';
      const cleanJson = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
      const parsed = JSON.parse(cleanJson);

      if (Array.isArray(parsed) && parsed.length > 0) {
        const allowedRatios = (request.aspectRatios && request.aspectRatios.length > 0)
          ? request.aspectRatios
          : ['2:3' as const];

        return parsed.map((item, idx) => ({
          id: `gen-${Date.now()}-${idx}`,
          titles: item.titles || [item.selectedTitle],
          selectedTitle: item.selectedTitle || item.titles?.[0] || topic,
          description: item.description || '',
          altText: item.altText || '',
          suggestedBoard: targetBoard || 'Curated Pins',
          keywords: item.keywords || [topic],
          headlineOverlay: item.headlineOverlay || item.selectedTitle,
          subheadlineOverlay: item.subheadlineOverlay || 'Essential Guide & Tips',
          ctaText: item.ctaText || 'Save for later',
          imageUrl: SAMPLE_IMAGES[idx % SAMPLE_IMAGES.length],
          tone,
          aspectRatio: allowedRatios[idx % allowedRatios.length],
        }));
      }
    } catch (err) {
      console.warn('Gemini API call failed, switching to algorithmic PinSprig engine:', err);
    }
  }

  // Fallback intelligent generator with locale-aware templates
  return generateAlgorithmicPins(request);
}

function generateAlgorithmicPins(request: PinGenerationRequest): GeneratedPinVariation[] {
  const { topic, tone, targetBoard, contentLanguage, count } = request;

  const results: GeneratedPinVariation[] = [];

  const langTemplates: Record<string, {
    titlePrefixes: string[];
    descriptions: (topic: string, angle: string) => string;
    cta: string;
    subheadlines: string[];
  }> = {
    ru: {
      titlePrefixes: [
        'Пошаговый гид:',
        'Секреты и идеи:',
        '7 проверенных правил:',
        'Как оформить:',
        'Эстетичный тренд:',
      ],
      descriptions: (t, a) =>
        `Ищете идеальные идеи для ${t}? В этой подборке мы делимся практическими советами по созданию ${a}. Узнайте, как сочетать детали, оптимизировать пространство и внедрить современные тренды. Сохраните пин к себе на доску, чтобы не потерять! #pinterest #идеи #вдохновение #дизайн #тренды`,
      cta: 'Сохранить на доску',
      subheadlines: ['Главные секреты экспертов', 'Эстетичные лайфхаки', 'Полная подборка идей', 'Практичный чек-лист', 'Тренды этого сезона'],
    },
    es: {
      titlePrefixes: [
        'Guía definitiva de',
        '7 reglas clave para',
        'Secretos de diseño:',
        'Cómo transformar tu espacio:',
        'Inspiración estética:',
      ],
      descriptions: (t, a) =>
        `Descubre la mejor inspiración para ${t}. En esta guía te mostramos cómo lograr ${a} con ideas prácticas y accesibles. Guarda este pin en tus tableros para tenerlo siempre a mano cuando lo necesites. #inspiracion #estilo #tendencias #ideas #pinterest`,
      cta: 'Guarda para después',
      subheadlines: ['Consejos clave de expertos', 'Guía estética paso a paso', 'Ideas fáciles de aplicar', 'Tendencias de temporada', 'Inspiración diaria'],
    },
    pt: {
      titlePrefixes: [
        'Guia definitivo de',
        '7 regras práticas para',
        'Segredos de estilo:',
        'Como transformar com',
        'Inspiração estética:',
      ],
      descriptions: (t, a) =>
        `Explore as melhores ideias para ${t}. Neste guia especial reunimos dicas fundamentais para dominar ${a}. Salve esta pasta no seu perfil para consultar sempre que precisar! #inspiracao #estilo #tendencias #dicas #pinterest`,
      cta: 'Salvar na pasta',
      subheadlines: ['Dicas essenciais de especialistas', 'Guia estético prático', 'Inspirações do momento', 'Checklist completo', 'Tendências em alta'],
    },
    de: {
      titlePrefixes: [
        'Der ultimative Leitfaden:',
        '7 goldene Regeln für',
        'Geheimnisse für perfekte',
        'So gelingt die Gestaltung:',
        'Ästhetischer Trend:',
      ],
      descriptions: (t, a) =>
        `Entdecken Sie die schönsten Inspirationen rund um ${t}. Mit diesen durchdachten Tipps schaffen Sie ${a} im Handumdrehen. Jetzt auf Ihrer Pinnwand merken und jederzeit wiederfinden! #inspiration #design #tipps #lifestyle #pinterest`,
      cta: 'Für später merken',
      subheadlines: ['Wichtige Experten-Tipps', 'Ästhetischer Schritt-für-Schritt-Guide', 'Praktische Checkliste', 'Die Trends der Saison', 'Einfach umsetzbar'],
    },
    fr: {
      titlePrefixes: [
        'Le guide complet :',
        '7 règles d’or pour',
        'Secrets de design :',
        'Comment réussir son',
        'Tendance esthétique :',
      ],
      descriptions: (t, a) =>
        `Découvrez nos meilleures inspirations pour ${t}. Dans ce guide, explorez comment créer ${a} avec élégance et simplicité. Épinglez dès maintenant sur vos tableaux pour retrouver ces conseils à tout moment ! #inspiration #design #lifestyle #idees #pinterest`,
      cta: 'Enregistrer pour plus tard',
      subheadlines: ['Les conseils clés d’experts', 'Guide étape par étape', 'Idées simples et élégantes', 'Tendances du moment', 'Checklist pratique'],
    },
    zh: {
      titlePrefixes: [
        '干货指南：',
        '7个核心法则：',
        '氛围感搭配秘诀：',
        '手把手教你搞定：',
        '高级感审美灵感：',
      ],
      descriptions: (t, a) =>
        `正在寻找关于 ${t} 的灵感吗？本期内容整理了实用的 ${a} 技巧，帮你轻松打造高级质感与舒适氛围。赶紧转存收藏到你的画板，随时随地翻看参考！ #生活美学 #设计灵感 #干货分享 #高级感 #pinterest`,
      cta: '点击转存收藏',
      subheadlines: ['高赞设计师经验总结', '手把手实用步骤', '低成本打造高级感', '当季热门美学风向', '新手也能轻松照抄'],
    },
    en: {
      titlePrefixes: [
        'The Complete Guide to',
        '7 Golden Rules for',
        'Aesthetic Secrets:',
        'How to Elevate Your',
        'Trending Ideas for',
      ],
      descriptions: (t, a) =>
        `Looking for the best inspiration on ${t}? In this curated guide, we break down proven ideas for ${a}. Tap through for full details and save this pin to your boards for easy access! #pinterest #ideas #aesthetic #inspiration #curated`,
      cta: 'Save for later',
      subheadlines: ['Expert styling principles', 'Step-by-step visual breakdown', 'Simple & high-impact tips', 'Trending aesthetic forecast', 'Easy checklist to save'],
    },
  };

  const currentLangPack = langTemplates[contentLanguage] || langTemplates.en;

  const angles = [
    'minimalist luxury & comfort',
    'high-converting visual aesthetics',
    'everyday practical elegance',
    'curated viral secrets',
    'step-by-step essential routine',
  ];

  const allowedRatios = (request.aspectRatios && request.aspectRatios.length > 0)
    ? request.aspectRatios
    : ['2:3' as const];

  for (let i = 0; i < count; i++) {
    const prefix = currentLangPack.titlePrefixes[i % currentLangPack.titlePrefixes.length];
    const angle = angles[i % angles.length];
    const cleanTopic = topic || 'Aesthetic Minimalist Inspiration';

    const titleA = `${prefix} ${cleanTopic}`;
    const titleB = `${cleanTopic}: ${currentLangPack.subheadlines[i % currentLangPack.subheadlines.length]}`;
    const titleC = `${cleanTopic} (${tone})`;

    results.push({
      id: `gen-${Date.now()}-${i}`,
      titles: [titleA, titleB, titleC],
      selectedTitle: titleA,
      description: currentLangPack.descriptions(cleanTopic, angle),
      altText: `High resolution vertical aesthetic photograph illustrating ${cleanTopic} with warm soft natural lighting and editorial composition.`,
      suggestedBoard: targetBoard || 'Aesthetic Moodboard',
      keywords: [
        cleanTopic.toLowerCase(),
        `${cleanTopic.toLowerCase()} ideas`,
        `${cleanTopic.toLowerCase()} aesthetic`,
        'viral pins',
      ],
      headlineOverlay: cleanTopic.length > 32 ? cleanTopic.slice(0, 32) + '...' : cleanTopic,
      subheadlineOverlay: currentLangPack.subheadlines[i % currentLangPack.subheadlines.length],
      ctaText: currentLangPack.cta,
      imageUrl: SAMPLE_IMAGES[i % SAMPLE_IMAGES.length],
      tone,
      aspectRatio: allowedRatios[i % allowedRatios.length],
    });
  }

  return results;
}

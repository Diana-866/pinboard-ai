import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform, MotionValue } from 'motion/react';
import {
  Sparkles,
  Wand2,
  LayoutGrid,
  CheckSquare,
  BarChart3,
  CalendarClock,
  Globe2,
  ArrowRight,
  Flower2,
  MousePointer2,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/i18nContext';
import { SupportedLanguage } from '../i18n/types';

import imgDecor from '../assets/images/pin_home_decor_1790670043705.jpg';
import imgSkincare from '../assets/images/pin_skincare_routine_1790670067721.jpg';
import imgMatcha from '../assets/images/pin_matcha_latte_1790670057380.jpg';
import imgTravel from '../assets/images/pin_travel_amalfi_1790670078173.jpg';

/* ── Цвета розовой полосы: белый текст читается при любой теме ── */
const ROSE_DEEP = '#A95668';
const ROSE_MID = '#C67B8C';
const ROSE_CTA = '#B96B7C';

/* ── Переводы лендинга на все языки интерфейса ── */
interface LandingStrings {
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  ctaStartFree: string;
  ctaLogin: string;
  ctaCabinet: string;
  ctaOpen: string;
  note: string;
  marquee: string[];
  audienceTitle: string;
  audience: string[];
  featTitle: string;
  featSub: string;
  features: { title: string; text: string }[];
  pinApi: string;
  pinApiBold: string;
  showTitle: string;
  showSub: string;
  win1Label: string;
  win1Prompt: string;
  win1Badge: string;
  win1Title: string;
  win1Text: string;
  win2Label: string;
  win2PinTitle: string;
  win2PinText: string;
  win2Tags: string[];
  win2Approve: string;
  win2Reject: string;
  win2Badge: string;
  win2Title: string;
  win2Text: string;
  stepsTitle: string;
  steps: { title: string; text: string }[];
  faqTitle: string;
  faq: { q: string; a: string }[];
  cta2Title: string;
  cta2Sub: string;
  cta2Btn: string;
  footerPrivacy: string;
  footerTerms: string;
  footerSupport: string;
  cabinet: string;
}

const L: Record<SupportedLanguage, LandingStrings> = {
  ru: {
    badge: 'AI-студия контента для Pinterest',
    h1a: 'Ваш Pinterest',
    h1b: 'расцветает',
    sub: 'PinPosy анализирует ваш сайт, придумывает доски, генерирует пины с картинками и описаниями — а вы просто утверждаете лучшее. Каждый пин проходит через ваши руки.',
    ctaStartFree: 'Начать бесплатно',
    ctaLogin: 'Войти',
    ctaCabinet: 'В личный кабинет',
    ctaOpen: 'Открыть PinPosy',
    note: 'Регистрация — минута. Без карты. Каждый пин — только через ваше утверждение.',
    marquee: ['Дизайн интерьера', 'Рецепты', 'Путешествия', 'Мода', 'Свадебный декор', 'Рукоделие', 'Красота и уход', 'Фитнес', 'Дача и сад', 'Лайфстайл'],
    audienceTitle: 'Для кого:',
    audience: ['Блогерам', 'Мастерам и хендмейду', 'Кулинарам', 'Дизайнерам интерьера', 'Магазинам вещей', 'Бьюти-мастерам', 'Тревел-авторам', 'Фитнес-проектам'],
    featTitle: 'Всё для роста, в одном окне',
    featSub: 'От «у меня есть сайт» до «мои пины публикуются по плану» — без дизайнера, копирайтера и хаоса в голове.',
    features: [
      { title: 'Анализ сайта', text: 'PinPosy читает ваш сайт и сам понимает нишу, аудиторию и тон — вам не нужно ничего объяснять.' },
      { title: 'Идеи досок', text: 'AI предлагает доски под вашу нишу с SEO-названиями и описаниями, которые находит Pinterest.' },
      { title: 'Генерация пинов', text: 'Заголовок, описание и картинка — готовые пины создаются за минуты, а не за часы в редакторе.' },
      { title: 'Ручное утверждение', text: 'Ничего не публикуется без вас: каждый пин вы утверждаете, правите или отклоняете сами.' },
      { title: 'План публикаций', text: 'Утверждённые пины встают в календарь — понятный график вместо хаотичного постинга.' },
      { title: 'Аналитика', text: 'Показы, сохранения и клики ваших пинов — видно, что работает, и что генерировать дальше.' },
    ],
    pinApiBold: 'Автопубликация в Pinterest',
    pinApi: ' — подключаем сразу после одобрения официального Pinterest API. Заявка подана, всё по правилам платформы.',
    showTitle: 'Загляните внутрь',
    showSub: 'Так выглядит работа с пинами — от генерации до утверждения. Без дизайнера и фотошопа.',
    win1Label: 'pinposy.com · генерация пинов',
    win1Prompt: 'Матча-латте: 6 пинов для доски «Кофейня дома»',
    win1Badge: '+6 пинов готово',
    win1Title: 'Генерация пинов',
    win1Text: 'Один клик — и у доски готовая партия пинов с картинками и описаниями.',
    win2Label: 'pinposy.com · кабинет утверждения',
    win2PinTitle: '5 ошибок в декоре гостиной',
    win2PinText: 'Скандинавский уют: как избежать типичных промахов и сделать гостиную тёплой…',
    win2Tags: ['дизайн интерьера', 'уют', 'гостиная'],
    win2Approve: 'Утвердить',
    win2Reject: 'Отклонить',
    win2Badge: 'Утверждено',
    win2Title: 'Ручное утверждение',
    win2Text: 'Каждый пин — через ваши руки. Публикуется только то, что вам нравится.',
    stepsTitle: 'Три шага до первого пина',
    steps: [
      { title: 'Оставьте ссылку на сайт', text: 'PinPosy сам определит нишу и аудиторию — даже если вы не маркетолог.' },
      { title: 'Получите доски и пины', text: 'Идеи досок и готовые пины: заголовок, описание и картинка — за минуты.' },
      { title: 'Утвердите и растите', text: 'Отбракуйте слабое, утвердите сильное — и следите за ростом в аналитике.' },
    ],
    faqTitle: 'Частые вопросы',
    faq: [
      { q: 'Нужно ли разбираться в Pinterest-продвижении?', a: 'Нет. PinPosy сам определит нишу по вашему сайту, предложит доски и готовые пины. Ваша задача — просматривать и выбирать лучшее.' },
      { q: 'Что-то публикуется без моего ведома?', a: 'Никогда. Каждый пин проходит через кабинет утверждения: вы видите картинку, заголовок и описание до публикации и сами решаете его судьбу.' },
      { q: 'Какие картинки используются в пинах?', a: 'Изображения генерирует AI специально под вашу нишу — уникальные, без чужих водяных знаков и ограничений стоков.' },
      { q: 'Сколько времени это занимает?', a: 'Первые доски и пины — через несколько минут после регистрации. Пакет генерации — минуты вместо часов в редакторе.' },
    ],
    cta2Title: 'Первый пин — уже сегодня',
    cta2Sub: 'Заведите аккаунт, укажите сайт — и посмотрите, что PinPosy придумает для вашей ниши.',
    cta2Btn: 'Создать аккаунт',
    footerPrivacy: 'Политика конфиденциальности',
    footerTerms: 'Условия использования',
    footerSupport: 'Поддержка',
    cabinet: 'Личный кабинет',
  },
  en: {
    badge: 'AI content studio for Pinterest',
    h1a: 'Your Pinterest',
    h1b: 'blooms',
    sub: 'PinPosy analyzes your website, invents boards, generates pins with images and descriptions — you just approve the best. Every pin passes through your hands.',
    ctaStartFree: 'Start free',
    ctaLogin: 'Log in',
    ctaCabinet: 'Open dashboard',
    ctaOpen: 'Open PinPosy',
    note: 'A minute to sign up. No card. Every pin is approved by you.',
    marquee: ['Interior design', 'Recipes', 'Travel', 'Fashion', 'Wedding decor', 'DIY & crafts', 'Beauty & care', 'Fitness', 'Garden', 'Lifestyle'],
    audienceTitle: 'For:',
    audience: ['Bloggers', 'Artisans', 'Food creators', 'Interior designers', 'Product shops', 'Beauty pros', 'Travel writers', 'Fitness projects'],
    featTitle: 'Everything to grow, in one window',
    featSub: 'From “I have a website” to “my pins publish on schedule” — no designer, copywriter, or chaos.',
    features: [
      { title: 'Website analysis', text: 'PinPosy reads your site and understands the niche, audience, and tone — no explaining needed.' },
      { title: 'Board ideas', text: 'AI suggests boards for your niche with SEO titles and descriptions Pinterest loves.' },
      { title: 'Pin generation', text: 'Title, description, and image — ready-made pins in minutes, not hours in an editor.' },
      { title: 'Manual approval', text: 'Nothing goes live without you: approve, edit, or reject every single pin.' },
      { title: 'Publishing plan', text: 'Approved pins land in a calendar — a clear schedule instead of chaotic posting.' },
      { title: 'Analytics', text: 'Impressions, saves, and clicks of your pins — see what works and what to generate next.' },
    ],
    pinApiBold: 'Auto-publishing to Pinterest',
    pinApi: ' — enabled right after the official Pinterest API is approved. Application submitted, fully compliant.',
    showTitle: 'Look inside',
    showSub: 'This is what working with pins looks like — from generation to approval. No designer or Photoshop.',
    win1Label: 'pinposy.com · pin generation',
    win1Prompt: 'Matcha latte: 6 pins for the “Home café” board',
    win1Badge: '+6 pins ready',
    win1Title: 'Pin generation',
    win1Text: 'One click — and the board has a fresh batch of pins with images and descriptions.',
    win2Label: 'pinposy.com · approval desk',
    win2PinTitle: '5 living room décor mistakes',
    win2PinText: 'Scandi comfort: how to avoid typical mistakes and make your living room warm…',
    win2Tags: ['interior design', 'cozy', 'living room'],
    win2Approve: 'Approve',
    win2Reject: 'Reject',
    win2Badge: 'Approved',
    win2Title: 'Manual approval',
    win2Text: 'Every pin goes through your hands. Only what you like gets published.',
    stepsTitle: 'Three steps to your first pin',
    steps: [
      { title: 'Drop your website link', text: 'PinPosy detects the niche and audience itself — even if you are not a marketer.' },
      { title: 'Get boards and pins', text: 'Board ideas and ready pins: title, description, and image — in minutes.' },
      { title: 'Approve and grow', text: 'Reject the weak, approve the strong — and watch growth in analytics.' },
    ],
    faqTitle: 'FAQ',
    faq: [
      { q: 'Do I need to know Pinterest marketing?', a: 'No. PinPosy detects your niche from your website, suggests boards and ready pins. Your job is to review and pick the best.' },
      { q: 'Will anything publish without my knowledge?', a: 'Never. Every pin goes through the approval desk: you see the image, title, and description before anything is published.' },
      { q: 'What images are used in pins?', a: 'AI generates images specifically for your niche — unique, with no third-party watermarks or stock limits.' },
      { q: 'How long does it take?', a: 'First boards and pins appear minutes after sign-up. A batch generation takes minutes instead of hours.' },
    ],
    cta2Title: 'Your first pin — today',
    cta2Sub: 'Create an account, drop your link — and see what PinPosy comes up with for your niche.',
    cta2Btn: 'Create account',
    footerPrivacy: 'Privacy Policy',
    footerTerms: 'Terms of Service',
    footerSupport: 'Support',
    cabinet: 'Dashboard',
  },
  es: {
    badge: 'Estudio de contenido IA para Pinterest',
    h1a: 'Tu Pinterest',
    h1b: 'florece',
    sub: 'PinPosy analiza tu web, inventa tableros, genera pines con imágenes y descripciones — tú solo apruebas lo mejor. Cada pin pasa por tus manos.',
    ctaStartFree: 'Empezar gratis',
    ctaLogin: 'Entrar',
    ctaCabinet: 'Ir al panel',
    ctaOpen: 'Abrir PinPosy',
    note: 'Un minuto para registrarte. Sin tarjeta. Cada pin lo apruebas tú.',
    marquee: ['Diseño de interiores', 'Recetas', 'Viajes', 'Moda', 'Decoración de bodas', 'Manualidades', 'Belleza', 'Fitness', 'Jardín', 'Lifestyle'],
    audienceTitle: 'Para:',
    audience: ['Blogueros', 'Artesanos', 'Creadores de cocina', 'Diseñadores de interiores', 'Tiendas', 'Profesionales de belleza', 'Viajeros', 'Proyectos fitness'],
    featTitle: 'Todo para crecer, en una ventana',
    featSub: 'De “tengo una web” a “mis pines se publican según plan” — sin diseñador ni caos.',
    features: [
      { title: 'Análisis del sitio', text: 'PinPosy lee tu web y entiende el nicho, la audiencia y el tono — sin explicaciones.' },
      { title: 'Ideas de tableros', text: 'La IA propone tableros para tu nicho con títulos y descripciones SEO que Pinterest encuentra.' },
      { title: 'Generación de pines', text: 'Título, descripción e imagen — pines listos en minutos, no horas en el editor.' },
      { title: 'Aprobación manual', text: 'Nada se publica sin ti: aprueba, edita o rechaza cada pin.' },
      { title: 'Plan de publicación', text: 'Los pines aprobados van al calendario — un plan claro en vez de caos.' },
      { title: 'Analítica', text: 'Impresiones, guardados y clics de tus pines — ve qué funciona y qué generar después.' },
    ],
    pinApiBold: 'Publicación automática en Pinterest',
    pinApi: ' — se activa cuando se apruebe la API oficial de Pinterest. Solicitud enviada, todo conforme a las reglas.',
    showTitle: 'Mira dentro',
    showSub: 'Así es trabajar con pines — de la generación a la aprobación. Sin diseñador ni Photoshop.',
    win1Label: 'pinposy.com · generación de pines',
    win1Prompt: 'Matcha latte: 6 pines para el tablero “Café en casa”',
    win1Badge: '+6 pines listos',
    win1Title: 'Generación de pines',
    win1Text: 'Un clic — y el tablero tiene una tanda de pines con imágenes y descripciones.',
    win2Label: 'pinposy.com · mesa de aprobación',
    win2PinTitle: '5 errores en la decoración del salón',
    win2PinText: 'Confort nórdico: cómo evitar errores típicos y lograr un salón acogedor…',
    win2Tags: ['interiorismo', 'acogedor', 'salón'],
    win2Approve: 'Aprobar',
    win2Reject: 'Rechazar',
    win2Badge: 'Aprobado',
    win2Title: 'Aprobación manual',
    win2Text: 'Cada pin pasa por tus manos. Solo se publica lo que te gusta.',
    stepsTitle: 'Tres pasos hasta tu primer pin',
    steps: [
      { title: 'Pon el enlace de tu web', text: 'PinPosy detecta el nicho y la audiencia por sí mismo — aunque no seas marketero.' },
      { title: 'Recibe tableros y pines', text: 'Ideas de tableros y pines listos: título, descripción e imagen — en minutos.' },
      { title: 'Aprueba y crece', text: 'Descarta lo débil, aprueba lo fuerte — y mira el crecimiento en la analítica.' },
    ],
    faqTitle: 'Preguntas frecuentes',
    faq: [
      { q: '¿Necesito saber de marketing en Pinterest?', a: 'No. PinPosy detecta tu nicho desde tu web, propone tableros y pines listos. Tu tarea es revisar y elegir lo mejor.' },
      { q: '¿Se publica algo sin mi conocimiento?', a: 'Nunca. Cada pin pasa por la mesa de aprobación: ves la imagen, el título y la descripción antes de publicar.' },
      { q: '¿Qué imágenes se usan en los pines?', a: 'La IA genera imágenes para tu nicho — únicas, sin marcas de agua ni límites de bancos de fotos.' },
      { q: '¿Cuánto tiempo lleva?', a: 'Los primeros tableros y pines — minutos tras el registro. Una generación por lotes — minutos en vez de horas.' },
    ],
    cta2Title: 'Tu primer pin — hoy',
    cta2Sub: 'Crea una cuenta, pon tu enlace — y mira lo que PinPosy inventa para tu nicho.',
    cta2Btn: 'Crear cuenta',
    footerPrivacy: 'Política de privacidad',
    footerTerms: 'Términos del servicio',
    footerSupport: 'Soporte',
    cabinet: 'Panel',
  },
  pt: {
    badge: 'Estúdio de conteúdo IA para Pinterest',
    h1a: 'Seu Pinterest',
    h1b: 'floresce',
    sub: 'O PinPosy analisa seu site, cria ideias de quadros, gera pins com imagens e descrições — você só aprova o melhor. Cada pin passa pelas suas mãos.',
    ctaStartFree: 'Começar grátis',
    ctaLogin: 'Entrar',
    ctaCabinet: 'Ir ao painel',
    ctaOpen: 'Abrir PinPosy',
    note: 'Um minuto para se cadastrar. Sem cartão. Cada pin é aprovado por você.',
    marquee: ['Design de interiores', 'Receitas', 'Viagens', 'Moda', 'Decoração de casamento', 'Artesanato', 'Beleza', 'Fitness', 'Jardim', 'Lifestyle'],
    audienceTitle: 'Para:',
    audience: ['Blogueiros', 'Artesãos', 'Criadores de culinária', 'Designers de interiores', 'Lojas', 'Profissionais de beleza', 'Viajantes', 'Projetos fitness'],
    featTitle: 'Tudo para crescer, numa janela',
    featSub: 'De “tenho um site” a “meus pins são publicados no plano” — sem designer nem caos.',
    features: [
      { title: 'Análise do site', text: 'O PinPosy lê seu site e entende o nicho, o público e o tom — sem explicações.' },
      { title: 'Ideias de quadros', text: 'A IA propõe quadros para o seu nicho com títulos e descrições SEO que o Pinterest encontra.' },
      { title: 'Geração de pins', text: 'Título, descrição e imagem — pins prontos em minutos, não horas no editor.' },
      { title: 'Aprovação manual', text: 'Nada é publicado sem você: aprove, edite ou rejeite cada pin.' },
      { title: 'Plano de publicação', text: 'Pins aprovados entram no calendário — um cronograma claro em vez de caos.' },
      { title: 'Analytics', text: 'Impressões, salvamentos e cliques dos seus pins — veja o que funciona e o que gerar depois.' },
    ],
    pinApiBold: 'Publicação automática no Pinterest',
    pinApi: ' — ativada assim que a API oficial do Pinterest for aprovada. Pedido enviado, tudo conforme as regras.',
    showTitle: 'Olhe por dentro',
    showSub: 'É assim que se trabalha com pins — da geração à aprovação. Sem designer nem Photoshop.',
    win1Label: 'pinposy.com · geração de pins',
    win1Prompt: 'Matcha latte: 6 pins para o quadro “Café em casa”',
    win1Badge: '+6 pins prontos',
    win1Title: 'Geração de pins',
    win1Text: 'Um clique — e o quadro tem uma leva de pins com imagens e descrições.',
    win2Label: 'pinposy.com · mesa de aprovação',
    win2PinTitle: '5 erros na decoração da sala',
    win2PinText: 'Conforto nórdico: como evitar erros típicos e deixar a sala acolhedora…',
    win2Tags: ['design de interiores', 'aconchego', 'sala'],
    win2Approve: 'Aprovar',
    win2Reject: 'Rejeitar',
    win2Badge: 'Aprovado',
    win2Title: 'Aprovação manual',
    win2Text: 'Cada pin passa pelas suas mãos. Só é publicado o que você gosta.',
    stepsTitle: 'Três passos até o primeiro pin',
    steps: [
      { title: 'Deixe o link do site', text: 'O PinPosy detecta o nicho e o público sozinho — mesmo que você não seja marketero.' },
      { title: 'Receba quadros e pins', text: 'Ideias de quadros e pins prontos: título, descrição e imagem — em minutos.' },
      { title: 'Aprove e cresça', text: 'Descarte o fraco, aprove o forte — e acompanhe o crescimento na analytics.' },
    ],
    faqTitle: 'Perguntas frequentes',
    faq: [
      { q: 'Preciso entender de marketing no Pinterest?', a: 'Não. O PinPosy detecta seu nicho pelo site, sugere quadros e pins prontos. Sua tarefa é revisar e escolher o melhor.' },
      { q: 'Algo é publicado sem meu conhecimento?', a: 'Nunca. Cada pin passa pela mesa de aprovação: você vê imagem, título e descrição antes da publicação.' },
      { q: 'Que imagens são usadas nos pins?', a: 'A IA gera imagens para o seu nicho — únicas, sem marcas d’água nem limites de bancos de imagem.' },
      { q: 'Quanto tempo leva?', a: 'Primeiros quadros e pins — minutos após o cadastro. Uma geração em lote — minutos em vez de horas.' },
    ],
    cta2Title: 'Seu primeiro pin — hoje',
    cta2Sub: 'Crie a conta, deixe o link — e veja o que o PinPosy inventa para o seu nicho.',
    cta2Btn: 'Criar conta',
    footerPrivacy: 'Política de Privacidade',
    footerTerms: 'Termos de Serviço',
    footerSupport: 'Suporte',
    cabinet: 'Painel',
  },
  de: {
    badge: 'KI-Contentstudio für Pinterest',
    h1a: 'Ihr Pinterest',
    h1b: 'erblüht',
    sub: 'PinPosy analysiert Ihre Website, erfindet Pinnwände, generiert Pins mit Bildern und Beschreibungen — Sie geben nur das Beste frei. Jeder Pin geht durch Ihre Hände.',
    ctaStartFree: 'Kostenlos starten',
    ctaLogin: 'Anmelden',
    ctaCabinet: 'Zum Dashboard',
    ctaOpen: 'PinPosy öffnen',
    note: 'Eine Minute bis zur Anmeldung. Ohne Karte. Jeder Pin wird von Ihnen freigegeben.',
    marquee: ['Innenarchitektur', 'Rezepte', 'Reisen', 'Mode', 'Hochzeitsdeko', 'Handwerk', 'Beauty', 'Fitness', 'Garten', 'Lifestyle'],
    audienceTitle: 'Für:',
    audience: ['Blogger', 'Handwerker', 'Food-Creator', 'Interior-Designer', 'Shops', 'Beauty-Profis', 'Reiseautoren', 'Fitness-Projekte'],
    featTitle: 'Alles fürs Wachstum, in einem Fenster',
    featSub: 'Von „Ich habe eine Website“ bis „Meine Pins erscheinen nach Plan“ — ohne Designer und Chaos.',
    features: [
      { title: 'Website-Analyse', text: 'PinPosy liest Ihre Website und versteht Nische, Publikum und Tonalität — ohne Erklärungen.' },
      { title: 'Pinnwand-Ideen', text: 'Die KI schlägt Pinnwände für Ihre Nische vor — mit SEO-Titeln, die Pinterest findet.' },
      { title: 'Pin-Generierung', text: 'Titel, Beschreibung und Bild — fertige Pins in Minuten statt Stunden im Editor.' },
      { title: 'Manuelle Freigabe', text: 'Nichts geht ohne Sie live: jeden Pin freigeben, bearbeiten oder ablehnen.' },
      { title: 'Veröffentlichungsplan', text: 'Freigegebene Pins landen im Kalender — klarer Plan statt chaotischem Posten.' },
      { title: 'Analytics', text: 'Impressions, Saves und Klicks Ihrer Pins — sehen, was funktioniert und was als Nächstes generiert wird.' },
    ],
    pinApiBold: 'Auto-Veröffentlichung auf Pinterest',
    pinApi: ' — aktiviert, sobald die offizielle Pinterest API genehmigt ist. Antrag eingereicht, alles regelkonform.',
    showTitle: 'Blicken Sie hinein',
    showSub: 'So sieht die Arbeit mit Pins aus — von der Generierung bis zur Freigabe. Ohne Designer und Photoshop.',
    win1Label: 'pinposy.com · Pin-Generierung',
    win1Prompt: 'Matcha Latte: 6 Pins fürs Board „Café zuhause“',
    win1Badge: '+6 Pins fertig',
    win1Title: 'Pin-Generierung',
    win1Text: 'Ein Klick — und das Board hat eine frische Ladung Pins mit Bildern und Beschreibungen.',
    win2Label: 'pinposy.com · Freigabe-Schreibtisch',
    win2PinTitle: '5 Fehler in der Wohnzimmer-Deko',
    win2PinText: 'Skandinavischer Komfort: typische Fehler vermeiden und das Wohnzimmer gemütlich machen…',
    win2Tags: ['Interior', 'gemütlich', 'Wohnzimmer'],
    win2Approve: 'Freigeben',
    win2Reject: 'Ablehnen',
    win2Badge: 'Freigegeben',
    win2Title: 'Manuelle Freigabe',
    win2Text: 'Jeder Pin geht durch Ihre Hände. Nur veröffentlicht, was Ihnen gefällt.',
    stepsTitle: 'Drei Schritte zum ersten Pin',
    steps: [
      { title: 'Website-Link einfügen', text: 'PinPosy erkennt Nische und Publikum selbst — auch wenn Sie kein Marketer sind.' },
      { title: 'Pinnwände und Pins erhalten', text: 'Board-Ideen und fertige Pins: Titel, Beschreibung und Bild — in Minuten.' },
      { title: 'Freigeben und wachsen', text: 'Schwaches aussortieren, starkes freigeben — und das Wachstum in der Analytics verfolgen.' },
    ],
    faqTitle: 'Häufige Fragen',
    faq: [
      { q: 'Muss ich Pinterest-Marketing beherrschen?', a: 'Nein. PinPosy erkennt die Nische aus Ihrer Website und schlägt Pinnwände und fertige Pins vor. Sie prüfen und wählen das Beste.' },
      { q: 'Wird etwas ohne mein Wissen veröffentlicht?', a: 'Nie. Jeder Pin geht durch die Freigabe: Sie sehen Bild, Titel und Beschreibung vor der Veröffentlichung.' },
      { q: 'Welche Bilder werden verwendet?', a: 'Die KI erzeugt Bilder speziell für Ihre Nische — einzigartig, ohne fremde Wasserzeichen oder Stock-Limits.' },
      { q: 'Wie lange dauert es?', a: 'Erste Pinnwände und Pins — Minuten nach der Anmeldung. Eine Stapelgenerierung — Minuten statt Stunden.' },
    ],
    cta2Title: 'Ihr erster Pin — noch heute',
    cta2Sub: 'Konto anlegen, Link einfügen — und sehen, was PinPosy für Ihre Nische erfindet.',
    cta2Btn: 'Konto erstellen',
    footerPrivacy: 'Datenschutz',
    footerTerms: 'Nutzungsbedingungen',
    footerSupport: 'Support',
    cabinet: 'Dashboard',
  },
  fr: {
    badge: 'Studio de contenu IA pour Pinterest',
    h1a: 'Votre Pinterest',
    h1b: 'fleurit',
    sub: 'PinPosy analyse votre site, invente des tableaux, génère des épingles avec images et descriptions — vous validez simplement le meilleur. Chaque épingle passe entre vos mains.',
    ctaStartFree: 'Commencer gratuitement',
    ctaLogin: 'Se connecter',
    ctaCabinet: 'Au tableau de bord',
    ctaOpen: 'Ouvrir PinPosy',
    note: 'Une minute pour s’inscrire. Sans carte. Chaque épingle est validée par vous.',
    marquee: ['Déco intérieure', 'Recettes', 'Voyages', 'Mode', 'Déco de mariage', 'DIY', 'Beauté', 'Fitness', 'Jardin', 'Lifestyle'],
    audienceTitle: 'Pour :',
    audience: ['Blogueurs', 'Artisans', 'Créateurs culinaires', 'Décorateurs', 'Boutiques', 'Pros de la beauté', 'Voyageurs', 'Projets fitness'],
    featTitle: 'Tout pour grandir, dans une seule fenêtre',
    featSub: 'De « j’ai un site » à « mes épingles sont publiées selon le plan » — sans designer ni chaos.',
    features: [
      { title: 'Analyse du site', text: 'PinPosy lit votre site et comprend la niche, l’audience et le ton — sans explications.' },
      { title: 'Idées de tableaux', text: 'L’IA propose des tableaux pour votre niche avec des titres SEO que Pinterest trouve.' },
      { title: 'Génération d’épingles', text: 'Titre, description et image — des épingles prêtes en minutes, pas des heures.' },
      { title: 'Validation manuelle', text: 'Rien n’est publié sans vous : validez, modifiez ou rejetez chaque épingle.' },
      { title: 'Plan de publication', text: 'Les épingles validées vont dans le calendrier — un planning clair, pas du chaos.' },
      { title: 'Statistiques', text: 'Impressions, enregistrements et clics de vos épingles — voyez ce qui marche et quoi générer ensuite.' },
    ],
    pinApiBold: 'Publication automatique sur Pinterest',
    pinApi: ' — activée dès l’approbation de l’API officielle Pinterest. Demande envoyée, tout est conforme.',
    showTitle: 'Regardez à l’intérieur',
    showSub: 'Voici à quoi ressemble le travail avec les épingles — de la génération à la validation.',
    win1Label: 'pinposy.com · génération d’épingles',
    win1Prompt: 'Matcha latte : 6 épingles pour le tableau « Café à la maison »',
    win1Badge: '+6 épingles prêtes',
    win1Title: 'Génération d’épingles',
    win1Text: 'Un clic — et le tableau reçoit une fournée d’épingles avec images et descriptions.',
    win2Label: 'pinposy.com · bureau de validation',
    win2PinTitle: '5 erreurs de déco dans le salon',
    win2PinText: 'Confort scandinave : éviter les erreurs classiques et rendre le salon chaleureux…',
    win2Tags: ['déco', 'cosy', 'salon'],
    win2Approve: 'Valider',
    win2Reject: 'Rejeter',
    win2Badge: 'Validé',
    win2Title: 'Validation manuelle',
    win2Text: 'Chaque épingle passe entre vos mains. Seul ce qui vous plaît est publié.',
    stepsTitle: 'Trois étapes vers la première épingle',
    steps: [
      { title: 'Déposez le lien du site', text: 'PinPosy détecte la niche et l’audience tout seul — même si vous n’êtes pas marketeur.' },
      { title: 'Recevez tableaux et épingles', text: 'Idées de tableaux et épingles prêtes : titre, description et image — en minutes.' },
      { title: 'Validez et grandissez', text: 'Écartez le faible, validez le fort — et suivez la croissance dans les stats.' },
    ],
    faqTitle: 'Questions fréquentes',
    faq: [
      { q: 'Faut-il connaître le marketing Pinterest ?', a: 'Non. PinPosy détecte votre niche depuis votre site, propose des tableaux et des épingles prêtes. À vous de choisir le meilleur.' },
      { q: 'Quelque chose est-il publié à mon insu ?', a: 'Jamais. Chaque épingle passe par la validation : vous voyez l’image, le titre et la description avant publication.' },
      { q: 'Quelles images sont utilisées ?', a: 'L’IA génère des images pour votre niche — uniques, sans filigranes ni limites de banques d’images.' },
      { q: 'Combien de temps cela prend-il ?', a: 'Premiers tableaux et épingles — quelques minutes après l’inscription. Une génération par lot — minutes au lieu d’heures.' },
    ],
    cta2Title: 'Votre première épingle — aujourd’hui',
    cta2Sub: 'Créez un compte, déposez votre lien — et voyez ce que PinPosy invente pour votre niche.',
    cta2Btn: 'Créer un compte',
    footerPrivacy: 'Confidentialité',
    footerTerms: 'Conditions d’utilisation',
    footerSupport: 'Support',
    cabinet: 'Tableau de bord',
  },
  zh: {
    badge: 'Pinterest AI 内容工作室',
    h1a: '你的 Pinterest',
    h1b: '自己绽放',
    sub: 'PinPosy 分析你的网站，构思图板，生成带图片和描述的 Pin——你只需挑选最好的。每个 Pin 都经过你的双手。',
    ctaStartFree: '免费开始',
    ctaLogin: '登录',
    ctaCabinet: '进入工作台',
    ctaOpen: '打开 PinPosy',
    note: '一分钟注册。无需银行卡。每个 Pin 都由你审核。',
    marquee: ['室内设计', '食谱', '旅行', '时尚', '婚礼布置', '手工', '美妆', '健身', '花园', '生活方式'],
    audienceTitle: '适合：',
    audience: ['博主', '手工艺人', '美食创作者', '室内设计师', '小店店主', '美妆师', '旅行作者', '健身项目'],
    featTitle: '增长所需，一站搞定',
    featSub: '从“我有网站”到“我的 Pin 按计划发布”——无需设计师，也没有混乱。',
    features: [
      { title: '网站分析', text: 'PinPosy 阅读你的网站，自动理解细分市场、受众与语气——无需解释。' },
      { title: '图板创意', text: 'AI 为你的细分市场提议图板，附 Pinterest 能搜到的 SEO 标题与描述。' },
      { title: 'Pin 生成', text: '标题、描述和图片——几分钟生成成品 Pin，而不是在编辑器里耗几个小时。' },
      { title: '人工审核', text: '没有你的确认绝不发布：每个 Pin 由你批准、修改或拒绝。' },
      { title: '发布计划', text: '批准的 Pin 进入日历——清晰排期，告别混乱发布。' },
      { title: '数据分析', text: '你的 Pin 的展示、保存与点击——看清什么有效，下一步生成什么。' },
    ],
    pinApiBold: '自动发布到 Pinterest',
    pinApi: '——在官方 Pinterest API 获批后立即开通。申请已提交，完全合规。',
    showTitle: '看看内部',
    showSub: '这就是与 Pin 打交道的样子——从生成到审核。无需设计师和 PS。',
    win1Label: 'pinposy.com · Pin 生成',
    win1Prompt: '抹茶拿铁：为“家庭咖啡馆”图板生成 6 个 Pin',
    win1Badge: '6 个 Pin 已完成',
    win1Title: 'Pin 生成',
    win1Text: '一键——图板就有一批带图片和描述的新 Pin。',
    win2Label: 'pinposy.com · 审核台',
    win2PinTitle: '客厅装饰的 5 个错误',
    win2PinText: '北欧式舒适：如何避免常见错误，让客厅更温馨……',
    win2Tags: ['室内设计', '温馨', '客厅'],
    win2Approve: '批准',
    win2Reject: '拒绝',
    win2Badge: '已批准',
    win2Title: '人工审核',
    win2Text: '每个 Pin 都经过你的双手。只发布你喜欢的。',
    stepsTitle: '三步到第一个 Pin',
    steps: [
      { title: '留下网站链接', text: 'PinPosy 自动识别细分市场和受众——即使你不是营销人。' },
      { title: '获得图板和 Pin', text: '图板创意和成品 Pin：标题、描述和图片——几分钟内。' },
      { title: '审核并成长', text: '淘汰弱的，批准强的——在数据中看到增长。' },
    ],
    faqTitle: '常见问题',
    faq: [
      { q: '需要懂 Pinterest 营销吗？', a: '不需要。PinPosy 从你的网站识别细分市场，提议图板和成品 Pin。你只需浏览并选择最好的。' },
      { q: '会不会在我不知情时发布？', a: '绝不。每个 Pin 都经过审核台：发布前你能看到图片、标题和描述。' },
      { q: 'Pin 使用什么图片？', a: 'AI 为你的细分市场专门生成图片——独一无二，没有第三方水印或图库限制。' },
      { q: '需要多长时间？', a: '注册几分钟后就有第一批图板和 Pin。批量生成只需几分钟，而不是几小时。' },
    ],
    cta2Title: '第一个 Pin——就在今天',
    cta2Sub: '创建账号，留下链接——看看 PinPosy 为你的细分市场想出什么。',
    cta2Btn: '创建账号',
    footerPrivacy: '隐私政策',
    footerTerms: '服务条款',
    footerSupport: '支持',
    cabinet: '工作台',
  },
};

/* ── Декоративные цветы (SVG-линия, белые на розовом) ── */
const FlowerLine: React.FC<{ className: string; opacity?: number }> = ({ className, opacity = 0.22 }) => (
  <svg viewBox="0 0 100 100" fill="none" className={className} style={{ opacity }} aria-hidden>
    <path d="M50 50 C 40 30, 55 15, 50 8 C 45 15, 60 30, 50 50 Z" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M50 50 C 30 45, 15 55, 8 50 C 15 45, 30 55, 50 50 Z" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M50 50 C 70 45, 85 55, 92 50 C 85 45, 70 55, 50 50 Z" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M50 50 C 45 70, 55 85, 50 92 C 45 85, 55 70, 50 50 Z" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="50" cy="50" r="5" stroke="white" strokeWidth="1.6" />
  </svg>
);

/* Летающая карточка пина с параллаксом за курсором */
interface FloatCardProps {
  src: string;
  label: string;
  className: string;
  depth: number;
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  delay?: number;
}

const FloatCard: React.FC<FloatCardProps> = ({ src, label, className, depth, sx, sy, delay = 0 }) => {
  const x = useTransform(sx, (v: number) => v * depth);
  const y = useTransform(sy, (v: number) => v * depth);
  return (
    <motion.div style={{ x, y }} className={`absolute hidden lg:block ${className}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
        animate={{ opacity: 1, scale: 1, rotate: depth > 0 ? 6 : -6, y: [0, -12, 0] }}
        transition={{
          opacity: { delay: 0.3 + delay, duration: 0.8 },
          scale: { delay: 0.3 + delay, duration: 0.8 },
          rotate: { delay: 0.3 + delay, duration: 0.8 },
          y: { repeat: Infinity, duration: 5 + delay * 2, ease: 'easeInOut', delay },
        }}
      >
        <div className="w-44 xl:w-52 rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/40">
          <img src={src} alt={label} className="w-full aspect-[2/3] object-cover" />
          <div className="px-3 py-2 text-[11px] font-medium text-[#7A3B47] bg-white">{label}</div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const FEATURES_ICONS = [Globe2, LayoutGrid, Wand2, CheckSquare, CalendarClock, BarChart3];

export const Landing: React.FC = () => {
  const { user } = useAuth();
  const { language: lang } = useI18n();
  const navigate = useNavigate();
  const [avatarError, setAvatarError] = useState(false);

  const s = L[lang] || L.en;

  // Параллакс за курсором
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 50, damping: 18 });
  const sy = useSpring(my, { stiffness: 50, damping: 18 });

  const handleMouse = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 30);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 30);
  };

  const letter = (user?.name || user?.email || 'P').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#FDF6F7] text-[#2A1F24] overflow-x-clip">
      <style>{`
        @keyframes pinposy-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .pinposy-marquee-track { animation: pinposy-marquee 30s linear infinite; will-change: transform; }
        details.pinposy-faq summary::-webkit-details-marker { display: none; }
        details.pinposy-faq summary { list-style: none; cursor: pointer; }
      `}</style>

      {/* ═══ РОЗОВАЯ ПОЛОСА: навбар + hero + бегущая строка ═══ */}
      <div
        className="relative"
        style={{ background: `linear-gradient(160deg, ${ROSE_DEEP} 0%, ${ROSE_MID} 55%, ${ROSE_DEEP} 100%)` }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <FlowerLine className="absolute top-10 left-[4%] w-40 h-40" opacity={0.18} />
          <FlowerLine className="absolute top-40 right-[6%] w-56 h-56" opacity={0.14} />
          <FlowerLine className="absolute bottom-24 left-[12%] w-28 h-28" opacity={0.12} />
          <FlowerLine className="absolute bottom-6 right-[16%] w-36 h-36" opacity={0.16} />
          <FlowerLine className="absolute top-1/2 left-[42%] w-24 h-24" opacity={0.1} />
          <div className="absolute -top-24 -left-24 w-[30rem] h-[30rem] rounded-full bg-white/10 blur-3xl" />
          <div className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full bg-[#7E3B4C]/40 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-[24rem] h-[24rem] rounded-full bg-white/5 blur-3xl" />
        </div>

        {/* ── Навигация ── */}
        <header className="relative z-40">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-lg">
                <Flower2 className="w-5 h-5" style={{ color: ROSE_CTA }} strokeWidth={2.4} />
              </span>
              <span className="text-lg font-extrabold tracking-tight text-white font-heading">PinPosy</span>
            </a>

            <nav className="flex items-center gap-2 sm:gap-3">
              {user ? (
                <button
                  onClick={() => navigate('/app')}
                  className="flex items-center gap-2.5 pl-1.5 pr-3 sm:pr-4 py-1.5 rounded-full bg-white shadow-lg group"
                  title="Open dashboard"
                >
                  {user.avatar && !avatarError ? (
                    <img
                      src={user.avatar}
                      alt="avatar"
                      onError={() => setAvatarError(true)}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                      style={{ background: ROSE_CTA }}
                    >
                      {letter}
                    </span>
                  )}
                  <span className="hidden sm:block text-xs font-bold text-[#7A3B47]">{s.cabinet}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#C25E6F] group-hover:translate-x-0.5 transition-transform" />
                </button>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white border border-white/50 hover:bg-white/10 transition-colors"
                  >
                    {s.ctaLogin}
                  </Link>
                  <Link
                    to="/register"
                    className="px-4 sm:px-5 py-2.5 rounded-xl bg-white text-sm font-extrabold shadow-lg hover:shadow-xl transition-shadow"
                    style={{ color: ROSE_CTA }}
                  >
                    {s.badge === L.ru.badge ? 'Начать' : lang === 'de' ? 'Los geht’s' : lang === 'fr' ? 'Commencer' : lang === 'es' ? 'Empezar' : lang === 'pt' ? 'Começar' : lang === 'zh' ? '开始' : 'Start'}
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>

        {/* ── Hero ── */}
        <section
          onMouseMove={handleMouse}
          onMouseLeave={() => {
            mx.set(0);
            my.set(0);
          }}
          className="relative"
        >
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-20 sm:pb-28 text-center">
            <motion.div style={{ x: sx, y: sy }} className="absolute inset-0 pointer-events-none">
              <FloatCard src={imgDecor} label={s.marquee[0]} className="left-[2%] top-[14%]" depth={-1.4} sx={sx} sy={sy} />
              <FloatCard src={imgSkincare} label={s.marquee[6]} className="right-[3%] top-[10%]" delay={0.6} depth={1.2} sx={sx} sy={sy} />
              <FloatCard src={imgMatcha} label={s.marquee[1]} className="left-[6%] bottom-[2%]" delay={1.1} depth={1.7} sx={sx} sy={sy} />
              <FloatCard src={imgTravel} label={s.marquee[2]} className="right-[7%] bottom-[6%]" delay={1.6} depth={-1.1} sx={sx} sy={sy} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="max-w-3xl mx-auto"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 border border-white/30 backdrop-blur text-xs font-bold text-white">
                <Sparkles className="w-3.5 h-3.5 text-white" />
                {s.badge}
              </div>

              <h1 className="mt-6 text-4xl sm:text-6xl xl:text-7xl font-extrabold tracking-tight leading-[1.05] text-white font-heading">
                {s.h1a}
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFE3EA] via-[#FFD1DC] to-[#F6C6D2]">
                  {s.h1b}
                </span>{' '}
              </h1>

              <p className="mt-6 text-base sm:text-lg leading-relaxed max-w-xl mx-auto text-[#FFE9EE]">{s.sub}</p>

              <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
                {user ? (
                  <button
                    onClick={() => navigate('/app')}
                    className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white text-sm font-extrabold shadow-xl hover:shadow-2xl transition-shadow flex items-center justify-center gap-2"
                    style={{ color: ROSE_CTA }}
                  >
                    {s.ctaCabinet}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <Link
                    to="/register"
                    className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white text-sm font-extrabold shadow-xl hover:shadow-2xl transition-shadow flex items-center justify-center gap-2"
                    style={{ color: ROSE_CTA }}
                  >
                    {s.ctaStartFree}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                <Link
                  to={user ? '/app' : '/login'}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl border-2 border-white/60 text-sm font-bold text-white hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
                >
                  {user ? s.ctaOpen : s.ctaLogin}
                </Link>
              </div>

              <p className="mt-5 text-[11px] font-medium text-[#F9D7DE]">{s.note}</p>
            </motion.div>
          </div>

          {/* Бегущая строка — бесшовная (у каждого элемента свой отступ, половины равны) */}
          <div className="relative border-t border-white/15 py-3.5 overflow-hidden" style={{ background: 'rgba(126,59,76,0.55)' }}>
            {/* Бесшовность: два атомарных одинаковых набора, -50% попадает ровно на стык */}
            <div className="pinposy-marquee-track flex w-max">
              {[0, 1].map((set) => (
                <div key={set} aria-hidden={set === 1} className="flex shrink-0 items-center">
                  {s.marquee.map((item, i) => (
                    <span key={i} className="flex items-center text-xs font-bold uppercase tracking-widest text-[#FFDCE4]">
                      <span className="px-5">{item}</span>
                      <Flower2 className="w-3 h-3 text-white/70" />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ═══ Светлая часть ═══ */}

      {/* ── Для кого ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-2.5"
        >
          <span className="text-xs font-bold uppercase tracking-widest text-[#A95668] mr-2">{s.audienceTitle}</span>
          {s.audience.map((a, i) => (
            <motion.span
              key={a}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className="rounded-full border border-[#EFD5DB] bg-white px-4 py-1.5 text-xs font-bold text-[#7A3B47] shadow-sm"
            >
              {a}
            </motion.span>
          ))}
        </motion.div>
      </section>

      {/* ── Возможности ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto"
        >
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-heading text-[#2A1F24]">{s.featTitle}</h2>
          <p className="mt-3 text-sm sm:text-base text-[#8A6E76]">{s.featSub}</p>
        </motion.div>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {s.features.map((f, i) => {
            const Icon = FEATURES_ICONS[i];
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.07 }}
                className="rounded-2xl border border-[#F2DFE4] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#E05375]/40 transition-all"
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: '#FCE8EE', color: ROSE_CTA }}>
                  <Icon className="w-5 h-5" strokeWidth={2.2} />
                </div>
                <h3 className="mt-4 text-base font-bold font-heading text-[#2A1F24]">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#8A6E76]">{f.text}</p>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-6 flex flex-col sm:flex-row items-center gap-3 rounded-2xl border border-dashed border-[#EFD5DB] bg-white/60 px-5 py-4 text-center sm:text-left"
        >
          <Globe2 className="w-5 h-5 shrink-0" style={{ color: ROSE_CTA }} />
          <p className="text-xs sm:text-[13px] text-[#8A6E76]">
            <span className="font-bold text-[#2A1F24]">{s.pinApiBold}</span>
            {s.pinApi}
          </p>
        </motion.div>
      </section>

      {/* ── Внутри PinPosy ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto"
        >
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-heading text-[#2A1F24]">{s.showTitle}</h2>
          <p className="mt-3 text-sm sm:text-base text-[#8A6E76]">{s.showSub}</p>
        </motion.div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-28 grid lg:grid-cols-2 gap-10 lg:gap-8 items-center">
        {/* Окно 1: генерация */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.65 }}
          className="relative"
        >
          <div className="absolute -inset-6 blur-3xl rounded-full pointer-events-none" style={{ background: 'rgba(224,83,117,0.16)' }} />
          <div className="relative rounded-2xl border border-[#F2DFE4] bg-white shadow-2xl overflow-hidden -rotate-1 hover:rotate-0 transition-transform duration-500">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#F2DFE4] bg-[#FDF6F7]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F0A5B5]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#F5C99B]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#9BD8B5]" />
              <span className="ml-3 flex-1 max-w-[220px] rounded-lg bg-white border border-[#F2DFE4] px-3 py-1 text-[10px] text-[#B29AA1] truncate">
                {s.win1Label}
              </span>
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-2 rounded-xl border border-[#F2DFE4] bg-[#FDF6F7] px-3.5 py-2.5">
                <Wand2 className="w-4 h-4 shrink-0" style={{ color: ROSE_CTA }} />
                <span className="text-[11px] sm:text-xs text-[#8A6E76] truncate">{s.win1Prompt}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {[imgMatcha, imgSkincare, imgDecor, imgTravel, imgMatcha, imgSkincare].map((src, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
                    className="rounded-xl overflow-hidden border border-[#F2DFE4]"
                  >
                    <img src={src} alt="pin" className="w-full aspect-[2/3] object-cover" />
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.8 }}
            className="absolute -top-3 -right-2 sm:-right-4 rotate-3 rounded-xl text-white text-[11px] font-extrabold px-3.5 py-2 shadow-xl flex items-center gap-1.5"
            style={{ background: ROSE_CTA }}
          >
            <Sparkles className="w-3.5 h-3.5" /> {s.win1Badge}
          </motion.div>
          <h3 className="mt-5 text-base font-bold font-heading text-[#2A1F24]">{s.win1Title}</h3>
          <p className="mt-1 text-[13px] text-[#8A6E76]">{s.win1Text}</p>
        </motion.div>

        {/* Окно 2: утверждение */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.65, delay: 0.15 }}
          className="relative"
        >
          <div className="absolute -inset-6 blur-3xl rounded-full pointer-events-none" style={{ background: 'rgba(169,86,104,0.14)' }} />
          <div className="relative rounded-2xl border border-[#F2DFE4] bg-white shadow-2xl overflow-hidden rotate-1 hover:rotate-0 transition-transform duration-500">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#F2DFE4] bg-[#FDF6F7]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F0A5B5]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#F5C99B]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#9BD8B5]" />
              <span className="ml-3 flex-1 max-w-[220px] rounded-lg bg-white border border-[#F2DFE4] px-3 py-1 text-[10px] text-[#B29AA1] truncate">
                {s.win2Label}
              </span>
            </div>
            <div className="p-4 sm:p-5">
              <div className="rounded-xl border border-[#F2DFE4] bg-[#FDF6F7] overflow-hidden flex">
                <img src={imgDecor} alt="pin" className="w-24 sm:w-28 aspect-[2/3] object-cover shrink-0" />
                <div className="flex-1 p-3.5 min-w-0">
                  <p className="text-xs font-extrabold text-[#2A1F24] leading-snug">{s.win2PinTitle}</p>
                  <p className="mt-1 text-[10px] text-[#8A6E76] line-clamp-2 leading-snug">{s.win2PinText}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {s.win2Tags.map((tag) => (
                      <span key={tag} className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: '#FCE8EE', color: ROSE_CTA }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <span className="flex items-center gap-1 rounded-lg text-white text-[10px] font-extrabold px-3 py-1.5" style={{ background: ROSE_CTA }}>
                      <CheckCircle2 className="w-3 h-3" /> {s.win2Approve}
                    </span>
                    <span className="rounded-lg border border-[#EFD5DB] text-[#8A6E76] text-[10px] font-bold px-3 py-1.5">{s.win2Reject}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2.5">
                {[imgSkincare, imgTravel, imgMatcha, imgDecor].map((src, i) => (
                  <div key={i} className="rounded-lg overflow-hidden border border-[#F2DFE4] opacity-70">
                    <img src={src} alt="pin" className="w-full aspect-[2/3] object-cover" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.9 }}
            className="absolute -top-3 -left-2 sm:-left-4 -rotate-3 rounded-xl bg-emerald-500 text-white text-[11px] font-extrabold px-3.5 py-2 shadow-xl shadow-emerald-500/40 flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> {s.win2Badge}
          </motion.div>
          <h3 className="mt-5 text-base font-bold font-heading text-[#2A1F24]">{s.win2Title}</h3>
          <p className="mt-1 text-[13px] text-[#8A6E76]">{s.win2Text}</p>
        </motion.div>
      </section>

      {/* ── Как это работает ── */}
      <section className="border-y border-[#F2DFE4] bg-white/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center font-heading text-[#2A1F24]"
          >
            {s.stepsTitle}
          </motion.h2>

          <div className="mt-12 grid sm:grid-cols-3 gap-5">
            {s.steps.map((st, i) => (
              <motion.div
                key={st.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: i * 0.12 }}
                className="relative rounded-2xl border border-[#F2DFE4] bg-white p-6 shadow-sm"
              >
                <span className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-[#C25E6F] to-[#A94B5C] font-heading">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 text-lg font-bold font-heading text-[#2A1F24]">{st.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#8A6E76]">{st.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Тарифы ── */}
      <section className="border-y border-[#F2DFE4] bg-white/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <motion.h2 initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{duration:0.6}} className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center font-heading text-[#2A1F24]">
            {lang === 'ru' ? 'Тарифы' : 'Pricing'}
          </motion.h2>
          <p className="mt-3 text-sm sm:text-base text-[#8A6E76] text-center max-w-xl mx-auto">
            {lang === 'ru' ? 'Прозрачные планы под любой размер проекта. Точные цены появятся вместе с запуском платежей.' : 'Transparent plans for any project size. Exact prices arrive with the payment launch.'}
          </p>
          <div className="mt-12 grid sm:grid-cols-3 gap-5">
            {(lang === 'ru' ? [
              { n: 'Старт', p: '390 ₽', sub: '$4.9 / мес', f: ['Только аналитика пинов', '1 проект', 'Мониторинг охватов', 'Поддержка по email'] },
              { n: 'Стандарт', p: '890 ₽', sub: '$9.9 / мес', f: ['Всё из Старт', 'Генерация досок и пинов', 'Ручное утверждение', 'Планировщик публикаций'] },
              { n: 'Про', p: '1 690 ₽', sub: '$18.9 / мес', f: ['Всё из Стандарт', '3 проекта', 'Приоритетная генерация', 'Расширенная аналитика'] },
            ] : [
              { n: 'Start', p: '$4.9', sub: '390 ₽ / mo', f: ['Pin analytics only', '1 project', 'Reach monitoring', 'Email support'] },
              { n: 'Standard', p: '$9.9', sub: '890 ₽ / mo', f: ['Everything in Start', 'Board & pin generation', 'Manual approval', 'Publishing planner'] },
              { n: 'Pro', p: '$18.9', sub: '1 690 ₽ / mo', f: ['Everything in Standard', '3 projects', 'Priority generation', 'Advanced analytics'] },
            ]).map((pl, i) => (
              <motion.div key={pl.n} initial={{opacity:0,y:24}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{duration:0.55, delay:i*0.12}}
                className={`relative rounded-2xl border bg-white p-6 shadow-sm ${i===1?'border-[#B96B7C] shadow-lg':''}`}>
                {i===1 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full text-white text-[10px] font-extrabold px-3 py-1" style={{background:'#B96B7C'}}>{lang==='ru'?'Выбор большинства':'Most popular'}</span>}
                <h3 className="text-lg font-extrabold font-heading text-[#2A1F24]">{pl.n}</h3>
                <p className="mt-2 text-3xl font-extrabold text-[#B96B7C] font-heading">{pl.p}</p>
                <p className="text-[11px] font-bold text-[#B29AA1]">{pl.sub}</p>
                <ul className="mt-4 space-y-2">
                  {pl.f.map((x)=>(<li key={x} className="flex items-start gap-2 text-[13px] text-[#8A6E76]"><CheckCircle2 className="w-4 h-4 text-[#B96B7C] shrink-0 mt-0.5"/>{x}</li>))}
                </ul>
                <Link to={user?'/app':'/register'} className={`mt-6 block text-center rounded-xl py-3 text-sm font-extrabold transition-colors ${i===1?'bg-[#B96B7C] text-white hover:bg-[#A95668]':'border border-[#F2DFE4] text-[#7A3B47] hover:border-[#B96B7C]'}`}>
                  {lang==='ru'?(i===0?'Перейти к тарифу':'Начать'):(i===0?'Choose plan':'Start')}
                </Link>
              </motion.div>
            ))}
          </div>
          <p className="mt-5 text-center text-[11px] text-[#B29AA1]">
            {lang==='ru'?'Оплата картами РФ и зарубежными. Первые 7 дней Стандарта — бесплатно, отмена в один клик.':'Pay with Russian or international cards. First 7 days of Standard are free, cancel anytime.'}
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center font-heading text-[#2A1F24]"
        >
          {s.faqTitle}
        </motion.h2>

        <div className="mt-10 space-y-3">
          {s.faq.map((f, i) => (
            <motion.details
              key={f.q}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              className="pinposy-faq rounded-2xl border border-[#F2DFE4] bg-white shadow-sm overflow-hidden"
              open={i === 0}
            >
              <summary className="flex items-center justify-between gap-4 px-5 py-4 text-sm font-bold text-[#2A1F24]">
                {f.q}
                <span className="text-[#C25E6F] text-lg leading-none">+</span>
              </summary>
              <p className="px-5 pb-4 text-[13px] leading-relaxed text-[#8A6E76]">{f.a}</p>
            </motion.details>
          ))}
        </div>
      </section>

      {/* ── Финальный CTA ── */}
      <section className="px-4 sm:px-6 pb-20 sm:pb-28">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl px-6 py-14 sm:py-20 text-center max-w-6xl mx-auto"
          style={{ background: `linear-gradient(150deg, ${ROSE_DEEP} 0%, ${ROSE_MID} 60%, ${ROSE_DEEP} 100%)` }}
        >
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <FlowerLine className="absolute -top-6 left-[8%] w-44 h-44" opacity={0.18} />
            <FlowerLine className="absolute -bottom-8 right-[6%] w-56 h-56" opacity={0.14} />
          </div>
          <div className="relative">
            <MousePointer2 className="w-6 h-6 text-white mx-auto" />
            <h2 className="mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight font-heading text-white">{s.cta2Title}</h2>
            <p className="mt-4 text-sm sm:text-base text-[#FFE9EE] max-w-md mx-auto">{s.cta2Sub}</p>
            <Link
              to={user ? '/app' : '/register'}
              className="mt-8 inline-flex items-center gap-2 px-9 py-4 rounded-2xl bg-white text-sm font-extrabold shadow-xl hover:shadow-2xl transition-shadow"
              style={{ color: ROSE_CTA }}
            >
              {user ? s.ctaCabinet : s.cta2Btn}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ── Подвал ── */}
      <footer className="border-t border-[#F2DFE4] bg-white/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#B29AA1]">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: ROSE_CTA }}>
              <Flower2 className="w-3.5 h-3.5 text-white" />
            </span>
            <span className="font-extrabold text-[#7A3B47]">PinPosy</span>
            <span>© 2026</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/privacy" className="hover:text-[#C25E6F] transition-colors">{s.footerPrivacy}</Link>
            <Link to="/terms" className="hover:text-[#C25E6F] transition-colors">{s.footerTerms}</Link>
            <a href="mailto:support@pinposy.com" className="hover:text-[#C25E6F] transition-colors">{s.footerSupport}</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

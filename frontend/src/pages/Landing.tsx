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

import imgDecor from '../assets/images/pin_home_decor_1790670043705.jpg';
import imgSkincare from '../assets/images/pin_skincare_routine_1790670067721.jpg';
import imgMatcha from '../assets/images/pin_matcha_latte_1790670057380.jpg';
import imgTravel from '../assets/images/pin_travel_amalfi_1790670078173.jpg';

/* ── Цвета hero-полосы: грязно-розовый фон, белый текст — контраст не зависит от темы ── */
const ROSE_DEEP = '#A95668';
const ROSE_MID = '#C67B8C';
const ROSE_CTA = '#C25E6F';
const ROSE_CTA_HOVER = '#B14E60';

/* ── Декоративные цветы (SVG-линия, всегда белые на розовом) ── */
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
    // Внешний слой — параллакс за курсором, внутренний — независимое «дыхание»
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

const MARQUEE_ITEMS = [
  'Дизайн интерьера',
  'Рецепты',
  'Путешествия',
  'Мода',
  'Свадебный декор',
  'Рукоделие',
  'Красота и уход',
  'Фитнес',
  'Дача и сад',
  'Лайфстайл',
];

const AUDIENCE = [
  'Блогерам',
  'Мастерам и хендмейду',
  'Кулинарам',
  'Дизайнерам интерьера',
  'Магазинам вещей',
  'Бьюти-мастерам',
  'Тревел-авторам',
  'Фитнес-проектам',
];

const FAQ = [
  {
    q: 'Нужно ли разбираться в Pinterest-продвижении?',
    a: 'Нет. PinPosy сам определит нишу по вашему сайту, предложит доски и готовые пины. Ваша задача — просматривать и выбирать лучшее.',
  },
  {
    q: 'Что-то публикуется без моего ведома?',
    a: 'Никогда. Каждый пин проходит через кабинет утверждения: вы видите картинку, заголовок и описание до публикации и сами решаете его судьбу.',
  },
  {
    q: 'Какие картинки используются в пинах?',
    a: 'Изображения генерирует AI специально под вашу нишу — уникальные, без чужих водяных знаков и ограничений стоков.',
  },
  {
    q: 'Сколько времени это занимает?',
    a: 'Первые доски и пины — через несколько минут после регистрации. Пакет генерации — минуты вместо часов в редакторе.',
  },
];

const FEATURES = [
  {
    icon: Globe2,
    title: 'Анализ сайта',
    text: 'PinPosy читает ваш сайт и сам понимает нишу, аудиторию и тон — вам не нужно ничего объяснять.',
  },
  {
    icon: LayoutGrid,
    title: 'Идеи досок',
    text: 'AI предлагает доски под вашу нишу с SEO-названиями и описаниями, которые находит Pinterest.',
  },
  {
    icon: Wand2,
    title: 'Генерация пинов',
    text: 'Заголовок, описание и картинка — готовые пины создаются за минуты, а не за часы в редакторе.',
  },
  {
    icon: CheckSquare,
    title: 'Ручное утверждение',
    text: 'Ничего не публикуется без вас: каждый пин вы утверждаете, правите или отклоняете сами.',
  },
  {
    icon: CalendarClock,
    title: 'План публикаций',
    text: 'Утверждённые пины встают в календарь — понятный график вместо хаотичного постинга.',
  },
  {
    icon: BarChart3,
    title: 'Аналитика',
    text: 'Показы, сохранения и клики ваших пинов — видно, что работает, и что генерировать дальше.',
  },
];

export const Landing: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [avatarError, setAvatarError] = useState(false);

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
        .pinposy-marquee-track { animation: pinposy-marquee 30s linear infinite; }
        details.pinposy-faq summary::-webkit-details-marker { display: none; }
        details.pinposy-faq summary { list-style: none; cursor: pointer; }
      `}</style>

      {/* ═══ РОЗОВАЯ ПОЛОСА: навбар + hero + бегущая строка ═══ */}
      <div
        className="relative"
        style={{ background: `linear-gradient(160deg, ${ROSE_DEEP} 0%, ${ROSE_MID} 55%, ${ROSE_DEEP} 100%)` }}
      >
        {/* Цветы на фоне */}
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

        {/* ── Навигация (на розовом — стеклянно-белая) ── */}
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
                  title="Перейти в личный кабинет"
                >
                  {user.avatar && !avatarError ? (
                    <img
                      src={user.avatar}
                      alt="Аватар"
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
                  <span className="hidden sm:block text-xs font-bold text-[#7A3B47]">Личный кабинет</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#C25E6F] group-hover:translate-x-0.5 transition-transform" />
                </button>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white border border-white/50 hover:bg-white/10 transition-colors"
                  >
                    Войти
                  </Link>
                  <Link
                    to="/register"
                    className="px-4 sm:px-5 py-2.5 rounded-xl bg-white text-sm font-extrabold shadow-lg hover:shadow-xl transition-shadow"
                    style={{ color: ROSE_CTA }}
                  >
                    Начать
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
            {/* Летающие пины */}
            <motion.div style={{ x: sx, y: sy }} className="absolute inset-0 pointer-events-none">
              <FloatCard src={imgDecor} label="Уютный интерьер" className="left-[2%] top-[14%]" depth={-1.4} sx={sx} sy={sy} />
              <FloatCard src={imgSkincare} label="Бьюти-рутина" className="right-[3%] top-[10%]" delay={0.6} depth={1.2} sx={sx} sy={sy} />
              <FloatCard src={imgMatcha} label="Матча-латте" className="left-[6%] bottom-[2%]" delay={1.1} depth={1.7} sx={sx} sy={sy} />
              <FloatCard src={imgTravel} label="Амальфи" className="right-[7%] bottom-[6%]" delay={1.6} depth={-1.1} sx={sx} sy={sy} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="max-w-3xl mx-auto"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 border border-white/30 backdrop-blur text-xs font-bold text-white">
                <Sparkles className="w-3.5 h-3.5 text-white" />
                AI-студия контента для Pinterest
              </div>

              <h1 className="mt-6 text-4xl sm:text-6xl xl:text-7xl font-extrabold tracking-tight leading-[1.05] text-white font-heading">
                Ваш Pinterest
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFE3EA] via-[#FFD1DC] to-[#F6C6D2]">
                  расцветает
                </span>{' '}
                сам
              </h1>

              <p className="mt-6 text-base sm:text-lg leading-relaxed max-w-xl mx-auto text-[#FFE9EE]">
                PinPosy анализирует ваш сайт, придумывает доски, генерирует пины с картинками и описаниями —
                а вы просто утверждаете лучшее. Каждый пин проходит через ваши руки.
              </p>

              <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
                {user ? (
                  <button
                    onClick={() => navigate('/app')}
                    className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white text-sm font-extrabold shadow-xl hover:shadow-2xl transition-shadow flex items-center justify-center gap-2"
                    style={{ color: ROSE_CTA }}
                  >
                    В личный кабинет
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <Link
                    to="/register"
                    className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white text-sm font-extrabold shadow-xl hover:shadow-2xl transition-shadow flex items-center justify-center gap-2"
                    style={{ color: ROSE_CTA }}
                  >
                    Начать бесплатно
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                <Link
                  to={user ? '/app' : '/login'}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl border-2 border-white/60 text-sm font-bold text-white hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
                >
                  {user ? 'Открыть PinPosy' : 'Войти'}
                </Link>
              </div>

              <p className="mt-5 text-[11px] font-medium text-[#F9D7DE]">
                Регистрация — минута. Без карты. Каждый пин — только через ваше утверждение.
              </p>
            </motion.div>
          </div>

          {/* Бегущая строка ниш — тёмно-розовая лента */}
          <div className="relative border-t border-white/15 py-3.5 overflow-hidden" style={{ background: 'rgba(126,59,76,0.55)' }}>
            <div className="pinposy-marquee-track flex whitespace-nowrap gap-8 w-max">
              {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
                <span key={i} className="flex items-center gap-8 text-xs font-bold uppercase tracking-widest text-[#FFDCE4]">
                  {item}
                  <Flower2 className="w-3 h-3 text-white/70" />
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ═══ ДАЛЬШЕ — светлая часть ═══ */}

      {/* ── Для кого ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-2.5"
        >
          <span className="text-xs font-bold uppercase tracking-widest text-[#A95668] mr-2">Для кого:</span>
          {AUDIENCE.map((a, i) => (
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
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-heading text-[#2A1F24]">
            Всё для роста, в одном окне
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#8A6E76]">
            От «у меня есть сайт» до «мои пины публикуются по плану» — без дизайнера, копирайтера и хаоса в голове.
          </p>
        </motion.div>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              className="rounded-2xl border border-[#F2DFE4] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#E05375]/40 transition-all"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: '#FCE8EE', color: ROSE_CTA }}>
                <f.icon className="w-5 h-5" strokeWidth={2.2} />
              </div>
              <h3 className="mt-4 text-base font-bold font-heading text-[#2A1F24]">{f.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#8A6E76]">{f.text}</p>
            </motion.div>
          ))}
        </div>

        {/* Честная плашка про Pinterest API */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-6 flex flex-col sm:flex-row items-center gap-3 rounded-2xl border border-dashed border-[#EFD5DB] bg-white/60 px-5 py-4 text-center sm:text-left"
        >
          <Globe2 className="w-5 h-5 shrink-0" style={{ color: ROSE_CTA }} />
          <p className="text-xs sm:text-[13px] text-[#8A6E76]">
            <span className="font-bold text-[#2A1F24]">Автопубликация в Pinterest</span> — подключаем сразу после
            одобрения официального Pinterest API. Заявка подана, всё по правилам платформы.
          </p>
        </motion.div>
      </section>

      {/* ── Внутри PinPosy: витрина продукта ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto"
        >
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-heading text-[#2A1F24]">
            Загляните внутрь
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#8A6E76]">
            Так выглядит работа с пинами — от генерации до утверждения. Без дизайнера и фотошопа.
          </p>
        </motion.div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-28 grid lg:grid-cols-2 gap-10 lg:gap-8 items-center">
        {/* Окно 1: генерация пинов */}
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
                pinposy.com · генерация пинов
              </span>
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-2 rounded-xl border border-[#F2DFE4] bg-[#FDF6F7] px-3.5 py-2.5">
                <Wand2 className="w-4 h-4 shrink-0" style={{ color: ROSE_CTA }} />
                <span className="text-[11px] sm:text-xs text-[#8A6E76] truncate">Матча-латте: 6 пинов для доски «Кофейня дома»</span>
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
                    <img src={src} alt="Сгенерированный пин" className="w-full aspect-[2/3] object-cover" />
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
            <Sparkles className="w-3.5 h-3.5" /> +6 пинов готово
          </motion.div>
          <h3 className="mt-5 text-base font-bold font-heading text-[#2A1F24]">Генерация пинов</h3>
          <p className="mt-1 text-[13px] text-[#8A6E76]">Один клик — и у доски готовая партия пинов с картинками и описаниями.</p>
        </motion.div>

        {/* Окно 2: утверждение пинов */}
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
                pinposy.com · кабинет утверждения
              </span>
            </div>
            <div className="p-4 sm:p-5">
              <div className="rounded-xl border border-[#F2DFE4] bg-[#FDF6F7] overflow-hidden flex">
                <img src={imgDecor} alt="Пин на утверждении" className="w-24 sm:w-28 aspect-[2/3] object-cover shrink-0" />
                <div className="flex-1 p-3.5 min-w-0">
                  <p className="text-xs font-extrabold text-[#2A1F24] leading-snug">5 ошибок в декоре гостиной</p>
                  <p className="mt-1 text-[10px] text-[#8A6E76] line-clamp-2 leading-snug">
                    Скандинавский уют: как избежать типичных промахов и сделать гостиную тёплой…
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {['дизайн интерьера', 'уют', 'гостиная'].map((tag) => (
                      <span key={tag} className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: '#FCE8EE', color: ROSE_CTA }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <span className="flex items-center gap-1 rounded-lg text-white text-[10px] font-extrabold px-3 py-1.5" style={{ background: ROSE_CTA }}>
                      <CheckCircle2 className="w-3 h-3" /> Утвердить
                    </span>
                    <span className="rounded-lg border border-[#EFD5DB] text-[#8A6E76] text-[10px] font-bold px-3 py-1.5">Отклонить</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2.5">
                {[imgSkincare, imgTravel, imgMatcha, imgDecor].map((src, i) => (
                  <div key={i} className="rounded-lg overflow-hidden border border-[#F2DFE4] opacity-70">
                    <img src={src} alt="Пин в очереди" className="w-full aspect-[2/3] object-cover" />
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
            <CheckCircle2 className="w-3.5 h-3.5" /> Утверждено
          </motion.div>
          <h3 className="mt-5 text-base font-bold font-heading text-[#2A1F24]">Ручное утверждение</h3>
          <p className="mt-1 text-[13px] text-[#8A6E76]">Каждый пин — через ваши руки. Публикуется только то, что вам нравится.</p>
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
            Три шага до первого пина
          </motion.h2>

          <div className="mt-12 grid sm:grid-cols-3 gap-5">
            {[
              { n: '01', title: 'Оставьте ссылку на сайт', text: 'PinPosy сам определит нишу и аудиторию — даже если вы не маркетолог.' },
              { n: '02', title: 'Получите доски и пины', text: 'Идеи досок и готовые пины: заголовок, описание и картинка — за минуты.' },
              { n: '03', title: 'Утвердите и растите', text: 'Отбракуйте слабое, утвердите сильное — и следите за ростом в аналитике.' },
            ].map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: i * 0.12 }}
                className="relative rounded-2xl border border-[#F2DFE4] bg-white p-6 shadow-sm"
              >
                <span className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-[#C25E6F] to-[#A94B5C] font-heading">
                  {s.n}
                </span>
                <h3 className="mt-3 text-lg font-bold font-heading text-[#2A1F24]">{s.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#8A6E76]">{s.text}</p>
              </motion.div>
            ))}
          </div>
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
          Частые вопросы
        </motion.h2>

        <div className="mt-10 space-y-3">
          {FAQ.map((f, i) => (
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

      {/* ── Финальный CTA на розовом ── */}
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
            <h2 className="mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight font-heading text-white">
              Первый пин — уже сегодня
            </h2>
            <p className="mt-4 text-sm sm:text-base text-[#FFE9EE] max-w-md mx-auto">
              Заведите аккаунт, укажите сайт — и посмотрите, что PinPosy придумает для вашей ниши.
            </p>
            <Link
              to={user ? '/app' : '/register'}
              className="mt-8 inline-flex items-center gap-2 px-9 py-4 rounded-2xl bg-white text-sm font-extrabold shadow-xl hover:shadow-2xl transition-shadow"
              style={{ color: ROSE_CTA }}
            >
              {user ? 'В личный кабинет' : 'Создать аккаунт'}
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
            <Link to="/privacy" className="hover:text-[#C25E6F] transition-colors">Политика конфиденциальности</Link>
            <Link to="/terms" className="hover:text-[#C25E6F] transition-colors">Условия использования</Link>
            <a href="mailto:d65gng532k@gmail.com" className="hover:text-[#C25E6F] transition-colors">Поддержка</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

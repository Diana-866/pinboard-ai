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
        <div className="w-44 xl:w-52 rounded-2xl overflow-hidden shadow-2xl border border-subtle bg-surface">
          <img src={src} alt={label} className="w-full aspect-[2/3] object-cover" />
          <div className="px-3 py-2 text-[11px] font-medium text-secondary-theme truncate">{label}</div>
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
    <div className="min-h-screen bg-page text-primary-theme overflow-x-clip">
      <style>{`
        @keyframes pinposy-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .pinposy-marquee-track { animation: pinposy-marquee 30s linear infinite; }
      `}</style>

      {/* ── Навигация ── */}
      <header className="sticky top-0 z-40 border-b border-subtle bg-surface/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shadow-lg shadow-accent/40">
              <Flower2 className="w-5 h-5 text-white" strokeWidth={2.2} />
            </span>
            <span className="text-lg font-extrabold tracking-tight font-heading text-primary-theme">PinPosy</span>
          </a>

          <nav className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <button
                onClick={() => navigate('/app')}
                className="flex items-center gap-2.5 pl-1.5 pr-3 sm:pr-4 py-1.5 rounded-full border border-subtle bg-surface hover:border-accent transition-all group shadow-sm"
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
                  <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-sm font-bold">
                    {letter}
                  </span>
                )}
                <span className="hidden sm:block text-xs font-semibold text-primary-theme">
                  Личный кабинет
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-accent group-hover:translate-x-0.5 transition-transform" />
              </button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2 rounded-xl text-sm font-semibold border border-subtle bg-page/70 text-primary-theme hover:border-accent hover:text-accent transition-colors"
                >
                  Войти
                </Link>
                <Link
                  to="/register"
                  className="px-4 sm:px-5 py-2.5 rounded-xl bg-accent text-sm font-bold text-white shadow-lg shadow-accent/40 hover:bg-accent/90 transition-colors"
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
        {/* Аврора-фон */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <motion.div
            className="absolute -top-32 -left-32 w-[34rem] h-[34rem] rounded-full bg-accent opacity-20 blur-3xl"
            animate={{ x: [0, 60, -30, 0], y: [0, 40, 80, 0] }}
            transition={{ repeat: Infinity, duration: 18, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-20 right-[-10rem] w-[30rem] h-[30rem] rounded-full bg-violet-500 opacity-15 blur-3xl"
            animate={{ x: [0, -70, 20, 0], y: [0, 60, -20, 0] }}
            transition={{ repeat: Infinity, duration: 22, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute bottom-[-8rem] left-1/3 w-[26rem] h-[26rem] rounded-full bg-amber-400 opacity-15 blur-3xl"
            animate={{ x: [0, 40, -50, 0], y: [0, -30, 20, 0] }}
            transition={{ repeat: Infinity, duration: 20, ease: 'easeInOut' }}
          />
          {/* Тонкая сетка */}
          <div
            className="absolute inset-0 opacity-[0.35] dark:opacity-[0.18]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(128,128,128,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(128,128,128,0.14) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
              maskImage: 'radial-gradient(ellipse 90% 70% at 50% 30%, black 30%, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 50% 30%, black 30%, transparent 75%)',
            }}
          />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-24 sm:pb-32 text-center">
          {/* Летающие пины */}
          <motion.div style={{ x: sx, y: sy }} className="absolute inset-0 pointer-events-none">
            <FloatCard src={imgDecor} label="Уютный интерьер" className="left-[2%] top-[16%]" depth={-1.4} sx={sx} sy={sy} />
            <FloatCard src={imgSkincare} label="Бьюти-рутин" className="right-[3%] top-[12%]" delay={0.6} depth={1.2} sx={sx} sy={sy} />
            <FloatCard src={imgMatcha} label="Матча-ботег" className="left-[6%] bottom-[4%]" delay={1.1} depth={1.7} sx={sx} sy={sy} />
            <FloatCard src={imgTravel} label="Амальфи" className="right-[7%] bottom-[8%]" delay={1.6} depth={-1.1} sx={sx} sy={sy} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-subtle bg-surface/70 backdrop-blur text-xs font-semibold text-secondary-theme">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              AI-студия контента для Pinterest
            </div>

            <h1 className="mt-6 text-4xl sm:text-6xl xl:text-7xl font-extrabold tracking-tight leading-[1.05] font-heading">
              Ваш Pinterest
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-rose-400 to-violet-400">
                расцветает
              </span>{' '}
              сам
            </h1>

            <p className="mt-6 text-base sm:text-lg text-secondary-theme leading-relaxed max-w-xl mx-auto">
              PinPosy анализирует ваш сайт, придумывает доски, генерирует пины с картинками и описаниями —
              а вы просто утверждаете лучшее. Каждый пин проходит через ваши руки.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
              {user ? (
                <button
                  onClick={() => navigate('/app')}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-accent text-sm font-bold text-white shadow-xl shadow-accent/30 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  В личный кабинет
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <Link
                  to="/register"
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-accent text-sm font-bold text-white shadow-xl shadow-accent/30 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  Начать бесплатно
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
              <Link
                to={user ? '/app' : '/login'}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl border border-subtle bg-surface text-sm font-semibold hover:border-accent transition-colors flex items-center justify-center gap-2"
              >
                {user ? 'Открыть PinPosy' : 'Войти'}
              </Link>
            </div>

            <p className="mt-4 text-[11px] text-muted-theme">
              Регистрация — минута. Без карты. Каждый пин — только через ваше утверждение.
            </p>
          </motion.div>
        </div>

        {/* Бегущая строка ниш */}
        <div className="relative border-y border-subtle/60 bg-surface/40 backdrop-blur py-3.5 overflow-hidden">
          <div className="pinposy-marquee-track flex whitespace-nowrap gap-8 w-max">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span key={i} className="flex items-center gap-8 text-xs font-semibold uppercase tracking-widest text-muted-theme">
                {item}
                <Flower2 className="w-3 h-3 text-accent/60" />
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Возможности ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto"
        >
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-heading">
            Всё для роста, в одном окне
          </h2>
          <p className="mt-3 text-sm sm:text-base text-secondary-theme">
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
              className="custom-card rounded-2xl border border-subtle bg-surface p-6 hover:border-accent/40 transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                <f.icon className="w-5 h-5" strokeWidth={2.2} />
              </div>
              <h3 className="mt-4 text-base font-bold font-heading">{f.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-secondary-theme">{f.text}</p>
            </motion.div>
          ))}
        </div>

        {/* Честная плашка про Pinterest API */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-6 flex flex-col sm:flex-row items-center gap-3 rounded-2xl border border-dashed border-subtle bg-surface/50 px-5 py-4 text-center sm:text-left"
        >
          <Globe2 className="w-5 h-5 text-accent shrink-0" />
          <p className="text-xs sm:text-[13px] text-secondary-theme">
            <span className="font-bold text-primary-theme">Автопубликация в Pinterest</span> — подключаем сразу после
            одобрения официального Pinterest API. Заявка подана, всё по правилам платформы.
          </p>
        </motion.div>
      </section>

      {/* ── Как это работает ── */}
      <section className="border-y border-subtle/60 bg-surface/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center font-heading"
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
                className="relative rounded-2xl border border-subtle bg-surface p-6 shadow-sm"
              >
                <span className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-accent to-rose-500 font-heading">
                  {s.n}
                </span>
                <h3 className="mt-3 text-lg font-bold font-heading text-primary-theme">{s.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-secondary-theme">{s.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
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
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-heading">
            Загляните внутрь
          </h2>
          <p className="mt-3 text-sm sm:text-base text-secondary-theme">
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
          <div className="absolute -inset-6 bg-accent/15 blur-3xl rounded-full pointer-events-none" />
          <div className="relative rounded-2xl border border-subtle bg-surface shadow-2xl overflow-hidden -rotate-1 hover:rotate-0 transition-transform duration-500">
            {/* Обрамление окна */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-subtle bg-page/60">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 flex-1 max-w-[220px] rounded-lg bg-surface border border-subtle px-3 py-1 text-[10px] text-muted-theme truncate">
                pinposy.com · генерация пинов
              </span>
            </div>
            <div className="p-4 sm:p-5">
              {/* Строка промпта */}
              <div className="flex items-center gap-2 rounded-xl border border-subtle bg-page px-3.5 py-2.5">
                <Wand2 className="w-4 h-4 text-accent shrink-0" />
                <span className="text-[11px] sm:text-xs text-secondary-theme truncate">Матча-латте: 6 пинов для доски «Кофейня дома»</span>
              </div>
              {/* Сетка генерации */}
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {[imgMatcha, imgSkincare, imgDecor, imgTravel, imgMatcha, imgSkincare].map((src, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
                    className="rounded-xl overflow-hidden border border-subtle"
                  >
                    <img src={src} alt="Сгенерированный пин" className="w-full aspect-[2/3] object-cover" />
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
          {/* Плавающий бейдж */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.8 }}
            className="absolute -top-3 -right-2 sm:-right-4 rotate-3 rounded-xl bg-accent text-white text-[11px] font-bold px-3.5 py-2 shadow-xl shadow-accent/40 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> +6 пинов готово
          </motion.div>
          <h3 className="mt-5 text-base font-bold font-heading text-primary-theme">Генерация пинов</h3>
          <p className="mt-1 text-[13px] text-secondary-theme">Один клик — и у доски готовая партия пинов с картинками и описаниями.</p>
        </motion.div>

        {/* Окно 2: утверждение пинов */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.65, delay: 0.15 }}
          className="relative"
        >
          <div className="absolute -inset-6 bg-violet-500/15 blur-3xl rounded-full pointer-events-none" />
          <div className="relative rounded-2xl border border-subtle bg-surface shadow-2xl overflow-hidden rotate-1 hover:rotate-0 transition-transform duration-500">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-subtle bg-page/60">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 flex-1 max-w-[220px] rounded-lg bg-surface border border-subtle px-3 py-1 text-[10px] text-muted-theme truncate">
                pinposy.com · кабинет утверждения
              </span>
            </div>
            <div className="p-4 sm:p-5">
              {/* Карточка на утверждении */}
              <div className="rounded-xl border border-subtle bg-page overflow-hidden flex">
                <img src={imgDecor} alt="Пин на утверждении" className="w-24 sm:w-28 aspect-[2/3] object-cover shrink-0" />
                <div className="flex-1 p-3.5 min-w-0">
                  <p className="text-xs font-bold text-primary-theme leading-snug">5 ошибок в декоре гостиной</p>
                  <p className="mt-1 text-[10px] text-secondary-theme line-clamp-2 leading-snug">Скандинавский уют: как избежать типичных промахов и сделать гостиную тёплой…</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {['дизайн интерьера', 'уют', 'гостиная'].map((tag) => (
                      <span key={tag} className="rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[9px] font-semibold">{tag}</span>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <span className="flex items-center gap-1 rounded-lg bg-accent text-white text-[10px] font-bold px-3 py-1.5">
                      <CheckCircle2 className="w-3 h-3" /> Утвердить
                    </span>
                    <span className="rounded-lg border border-subtle text-secondary-theme text-[10px] font-semibold px-3 py-1.5">Отклонить</span>
                  </div>
                </div>
              </div>
              {/* Очередь */}
              <div className="mt-3 grid grid-cols-4 gap-2.5">
                {[imgSkincare, imgTravel, imgMatcha, imgDecor].map((src, i) => (
                  <div key={i} className="rounded-lg overflow-hidden border border-subtle opacity-70">
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
            className="absolute -top-3 -left-2 sm:-left-4 -rotate-3 rounded-xl bg-emerald-500 text-white text-[11px] font-bold px-3.5 py-2 shadow-xl shadow-emerald-500/40 flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Утверждено
          </motion.div>
          <h3 className="mt-5 text-base font-bold font-heading text-primary-theme">Ручное утверждение</h3>
          <p className="mt-1 text-[13px] text-secondary-theme">Каждый пин — через ваши руки. Публикуется только то, что вам нравится.</p>
        </motion.div>
      </section>

      {/* ── Финальный CTA ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl border border-subtle bg-surface px-6 py-14 sm:py-20 text-center"
        >
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem] rounded-full bg-accent opacity-15 blur-3xl pointer-events-none" />
          <div className="relative">
            <MousePointer2 className="w-6 h-6 text-accent mx-auto" />
            <h2 className="mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight font-heading">
              Первый пин — уже сегодня
            </h2>
            <p className="mt-4 text-sm sm:text-base text-secondary-theme max-w-md mx-auto">
              Заведите аккаунт, укажите сайт — и посмотрите, что PinPosy придумает для вашей ниши.
            </p>
            <Link
              to={user ? '/app' : '/register'}
              className="mt-8 inline-flex items-center gap-2 px-9 py-4 rounded-2xl bg-accent text-sm font-bold text-white shadow-xl shadow-accent/30 hover:opacity-90 transition-opacity"
            >
              {user ? 'В личный кабинет' : 'Создать аккаунт'}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ── Подвал ── */}
      <footer className="border-t border-subtle/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-theme">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center">
              <Flower2 className="w-3.5 h-3.5 text-white" />
            </span>
            <span className="font-bold text-secondary-theme">PinPosy</span>
            <span>© 2026</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/privacy" className="hover:text-accent transition-colors">Политика конфиденциальности</Link>
            <Link to="/terms" className="hover:text-accent transition-colors">Условия использования</Link>
            <a href="mailto:d65gng532k@gmail.com" className="hover:text-accent transition-colors">Поддержка</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

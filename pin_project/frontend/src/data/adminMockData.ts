export type TaxRegime = 'self_employed' | 'usn_income_6' | 'usn_profit_15' | 'patent';

export interface DailyGenerationStat {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'admin' | 'user';
  registrationDate: string; // YYYY-MM-DD HH:mm
  plan: 'Analytics' | 'Start' | 'Pro' | 'Agency' | 'Free Trial';
  planPriceRub: number;
  planPriceUsd: number;
  subscriptionStatus: 'active' | 'trial' | 'canceled' | 'expired';
  renewalDate: string;
  creditsTotal: number;
  creditsUsed: number;
  nightGenerationEnabled: boolean;
  connectedAccounts: number;
  connectedBoards: number;
  lastActive: string;
  stats: {
    totalGenerations: number;
    botInquiries: number;
    analyticsViews: number;
    dailyGenerations: DailyGenerationStat[];
  };
}

export interface TransactionRecord {
  id: string;
  transactionNumber: string;
  userId: string;
  userName: string;
  userEmail: string;
  payerType: 'individual' | 'legal_entity'; // Физлицо (4% НПД) или Юрлицо/ИП (6% НПД)
  dateTime: string; // YYYY-MM-DD HH:mm:ss
  planId: string;
  planName: string;
  amountRub: number;
  amountUsd: number;
  gptTunnelCostRub: number; // Себестоимость токенов нейросети
  grossProfitRub: number; // Выручка - GPTTunnel
  paymentMethod: 'Tinkoff Pay' | 'Банковская карта (МИР/Visa)' | 'СБП' | 'Stripe' | 'Безналичный расчет';
  fiscalReceiptStatus: 'issued' | 'pending';
  fiscalReceiptNumber: string;
  fnNumber: string; // Номер фискального накопителя
  fdNumber: string; // Номер фискального документа
  fpdNumber: string; // Фискальный признак документа
  inn: string;
  taxPayerName: string;
  fiscalQrString: string;
}

// Generate last 14 days of daily generation history
const generateDailyStats = (baseCount: number, variance: number): DailyGenerationStat[] => {
  const stats: DailyGenerationStat[] = [];
  const today = new Date('2026-10-04T12:00:00Z');
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay();
    // Weekends slightly higher or lower
    const multiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 1.4 : 1.0;
    const count = Math.max(0, Math.round((baseCount + (Math.sin(i * 1.5) * variance)) * multiplier));
    stats.push({ date: dateStr, count });
  }
  return stats;
};

export const ADMIN_USERS: AdminUserRecord[] = [
  {
    id: 'usr-1',
    name: 'Елена Смирнова',
    email: 'sdreimei@gmail.com',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=face',
    role: 'admin',
    registrationDate: '2026-08-10 09:15',
    plan: 'Pro',
    planPriceRub: 4900,
    planPriceUsd: 59,
    subscriptionStatus: 'active',
    renewalDate: '2026-10-10',
    creditsTotal: 1200,
    creditsUsed: 360,
    nightGenerationEnabled: true,
    connectedAccounts: 2,
    connectedBoards: 4,
    lastActive: '5 минут назад',
    stats: {
      totalGenerations: 248,
      botInquiries: 62,
      analyticsViews: 114,
      dailyGenerations: generateDailyStats(18, 6),
    },
  },
  {
    id: 'usr-2',
    name: 'Анастасия Ковалёва',
    email: 'nastya.decor@mail.ru',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&crop=face',
    role: 'user',
    registrationDate: '2026-08-18 14:22',
    plan: 'Agency',
    planPriceRub: 14900,
    planPriceUsd: 179,
    subscriptionStatus: 'active',
    renewalDate: '2026-10-18',
    creditsTotal: 4000,
    creditsUsed: 1420,
    nightGenerationEnabled: true,
    connectedAccounts: 7,
    connectedBoards: 18,
    lastActive: '23 минуты назад',
    stats: {
      totalGenerations: 820,
      botInquiries: 145,
      analyticsViews: 340,
      dailyGenerations: generateDailyStats(45, 12),
    },
  },
  {
    id: 'usr-3',
    name: 'Дмитрий Волков',
    email: 'volkov.visuals@yandex.ru',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face',
    role: 'user',
    registrationDate: '2026-09-02 17:40',
    plan: 'Start',
    planPriceRub: 2490,
    planPriceUsd: 29.9,
    subscriptionStatus: 'active',
    renewalDate: '2026-10-02',
    creditsTotal: 400,
    creditsUsed: 310,
    nightGenerationEnabled: false,
    connectedAccounts: 1,
    connectedBoards: 2,
    lastActive: 'Сегодня в 10:14',
    stats: {
      totalGenerations: 142,
      botInquiries: 19,
      analyticsViews: 48,
      dailyGenerations: generateDailyStats(10, 4),
    },
  },
  {
    id: 'usr-4',
    name: 'София Миллер',
    email: 'sofia.nordic@gmail.com',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop&crop=face',
    role: 'user',
    registrationDate: '2026-09-12 11:05',
    plan: 'Pro',
    planPriceRub: 4900,
    planPriceUsd: 59,
    subscriptionStatus: 'active',
    renewalDate: '2026-10-12',
    creditsTotal: 1200,
    creditsUsed: 590,
    nightGenerationEnabled: true,
    connectedAccounts: 3,
    connectedBoards: 5,
    lastActive: '1 час назад',
    stats: {
      totalGenerations: 310,
      botInquiries: 84,
      analyticsViews: 128,
      dailyGenerations: generateDailyStats(22, 7),
    },
  },
  {
    id: 'usr-5',
    name: 'ООO «Студия Сканди Хоум» (Иван Р.)',
    email: 'b2b@scandihomestudio.ru',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop&crop=face',
    role: 'user',
    registrationDate: '2026-09-15 16:30',
    plan: 'Agency',
    planPriceRub: 14900,
    planPriceUsd: 179,
    subscriptionStatus: 'active',
    renewalDate: '2026-10-15',
    creditsTotal: 4000,
    creditsUsed: 2100,
    nightGenerationEnabled: true,
    connectedAccounts: 9,
    connectedBoards: 24,
    lastActive: '3 часа назад',
    stats: {
      totalGenerations: 950,
      botInquiries: 180,
      analyticsViews: 410,
      dailyGenerations: generateDailyStats(58, 15),
    },
  },
  {
    id: 'usr-6',
    name: 'Мария Лебедева',
    email: 'mariya.beauty@inbox.ru',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&h=120&fit=crop&crop=face',
    role: 'user',
    registrationDate: '2026-09-20 08:50',
    plan: 'Analytics',
    planPriceRub: 990,
    planPriceUsd: 11.9,
    subscriptionStatus: 'active',
    renewalDate: '2026-10-20',
    creditsTotal: 0,
    creditsUsed: 0,
    nightGenerationEnabled: false,
    connectedAccounts: 1,
    connectedBoards: 3,
    lastActive: 'Вчера',
    stats: {
      totalGenerations: 0,
      botInquiries: 38,
      analyticsViews: 195,
      dailyGenerations: generateDailyStats(0, 0),
    },
  },
  {
    id: 'usr-7',
    name: 'Алексей Березин',
    email: 'berezin.travel@gmail.com',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&h=120&fit=crop&crop=face',
    role: 'user',
    registrationDate: '2026-09-26 13:12',
    plan: 'Start',
    planPriceRub: 2490,
    planPriceUsd: 29.9,
    subscriptionStatus: 'active',
    renewalDate: '2026-10-26',
    creditsTotal: 400,
    creditsUsed: 190,
    nightGenerationEnabled: true,
    connectedAccounts: 1,
    connectedBoards: 4,
    lastActive: 'Вчера',
    stats: {
      totalGenerations: 95,
      botInquiries: 24,
      analyticsViews: 62,
      dailyGenerations: generateDailyStats(8, 3),
    },
  },
  {
    id: 'usr-8',
    name: 'Кристина Власова',
    email: 'kris.vlasova@icloud.com',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=120&h=120&fit=crop&crop=face',
    role: 'user',
    registrationDate: '2026-09-29 19:40',
    plan: 'Pro',
    planPriceRub: 4900,
    planPriceUsd: 59,
    subscriptionStatus: 'trial',
    renewalDate: '2026-10-06',
    creditsTotal: 150,
    creditsUsed: 80,
    nightGenerationEnabled: true,
    connectedAccounts: 1,
    connectedBoards: 2,
    lastActive: '4 часа назад',
    stats: {
      totalGenerations: 45,
      botInquiries: 12,
      analyticsViews: 31,
      dailyGenerations: generateDailyStats(7, 2),
    },
  },
];

export const ADMIN_TRANSACTIONS: TransactionRecord[] = [
  {
    id: 'tx-101',
    transactionNumber: 'CHK-2026-1004-01',
    userId: 'usr-5',
    userName: 'ООО «Студия Сканди Хоум»',
    userEmail: 'b2b@scandihomestudio.ru',
    payerType: 'legal_entity',
    dateTime: '2026-10-04 10:15:32',
    planId: 'agency',
    planName: 'Тариф Agency (Месяц) + 4000 кредитов',
    amountRub: 14900,
    amountUsd: 179,
    gptTunnelCostRub: 1680,
    grossProfitRub: 13220,
    paymentMethod: 'Безналичный расчет',
    fiscalReceiptStatus: 'issued',
    fiscalReceiptNumber: 'ФД-004812',
    fnNumber: '9960440301984210',
    fdNumber: '4812',
    fpdNumber: '2981409214',
    inn: '772819401823',
    taxPayerName: 'ИП Смирнова Елена Александровна',
    fiscalQrString: 't=20261004T1015&s=14900.00&fn=9960440301984210&i=4812&fp=2981409214&n=1',
  },
  {
    id: 'tx-102',
    transactionNumber: 'CHK-2026-1003-02',
    userId: 'usr-1',
    userName: 'Елена Смирнова',
    userEmail: 'sdreimei@gmail.com',
    payerType: 'individual',
    dateTime: '2026-10-03 16:42:10',
    planId: 'pro',
    planName: 'Тариф Pro (Месяц) + 1200 кредитов',
    amountRub: 4900,
    amountUsd: 59,
    gptTunnelCostRub: 520,
    grossProfitRub: 4380,
    paymentMethod: 'Tinkoff Pay',
    fiscalReceiptStatus: 'issued',
    fiscalReceiptNumber: 'ФД-004811',
    fnNumber: '9960440301984210',
    fdNumber: '4811',
    fpdNumber: '3819401822',
    inn: '772819401823',
    taxPayerName: 'ИП Смирнова Елена Александровна',
    fiscalQrString: 't=20261003T1642&s=4900.00&fn=9960440301984210&i=4811&fp=3819401822&n=1',
  },
  {
    id: 'tx-103',
    transactionNumber: 'CHK-2026-1002-03',
    userId: 'usr-4',
    userName: 'София Миллер',
    userEmail: 'sofia.nordic@gmail.com',
    payerType: 'individual',
    dateTime: '2026-10-02 12:20:05',
    planId: 'pro',
    planName: 'Тариф Pro (Месяц) + 1200 кредитов',
    amountRub: 4900,
    amountUsd: 59,
    gptTunnelCostRub: 520,
    grossProfitRub: 4380,
    paymentMethod: 'Банковская карта (МИР/Visa)',
    fiscalReceiptStatus: 'issued',
    fiscalReceiptNumber: 'ФД-004810',
    fnNumber: '9960440301984210',
    fdNumber: '4810',
    fpdNumber: '1940281745',
    inn: '772819401823',
    taxPayerName: 'ИП Смирнова Елена Александровна',
    fiscalQrString: 't=20261002T1220&s=4900.00&fn=9960440301984210&i=4810&fp=1940281745&n=1',
  },
  {
    id: 'tx-104',
    transactionNumber: 'CHK-2026-1001-04',
    userId: 'usr-2',
    userName: 'Анастасия Ковалёва',
    userEmail: 'nastya.decor@mail.ru',
    payerType: 'individual',
    dateTime: '2026-10-01 19:33:48',
    planId: 'agency',
    planName: 'Тариф Agency (Месяц) + 4000 кредитов',
    amountRub: 14900,
    amountUsd: 179,
    gptTunnelCostRub: 1680,
    grossProfitRub: 13220,
    paymentMethod: 'СБП',
    fiscalReceiptStatus: 'issued',
    fiscalReceiptNumber: 'ФД-004809',
    fnNumber: '9960440301984210',
    fdNumber: '4809',
    fpdNumber: '8392019482',
    inn: '772819401823',
    taxPayerName: 'ИП Смирнова Елена Александровна',
    fiscalQrString: 't=20261001T1933&s=14900.00&fn=9960440301984210&i=4809&fp=8392019482&n=1',
  },
  {
    id: 'tx-105',
    transactionNumber: 'CHK-2026-0928-05',
    userId: 'usr-7',
    userName: 'Алексей Березин',
    userEmail: 'berezin.travel@gmail.com',
    payerType: 'individual',
    dateTime: '2026-09-28 14:10:19',
    planId: 'start',
    planName: 'Тариф Start (Месяц) + 400 кредитов',
    amountRub: 2490,
    amountUsd: 29.9,
    gptTunnelCostRub: 280,
    grossProfitRub: 2210,
    paymentMethod: 'Tinkoff Pay',
    fiscalReceiptStatus: 'issued',
    fiscalReceiptNumber: 'ФД-004808',
    fnNumber: '9960440301984210',
    fdNumber: '4808',
    fpdNumber: '5729103948',
    inn: '772819401823',
    taxPayerName: 'ИП Смирнова Елена Александровна',
    fiscalQrString: 't=20260928T1410&s=2490.00&fn=9960440301984210&i=4808&fp=5729103948&n=1',
  },
  {
    id: 'tx-106',
    transactionNumber: 'CHK-2026-0925-06',
    userId: 'usr-3',
    userName: 'Дмитрий Волков',
    userEmail: 'volkov.visuals@yandex.ru',
    payerType: 'individual',
    dateTime: '2026-09-25 11:05:40',
    planId: 'start',
    planName: 'Тариф Start (Месяц) + 400 кредитов',
    amountRub: 2490,
    amountUsd: 29.9,
    gptTunnelCostRub: 280,
    grossProfitRub: 2210,
    paymentMethod: 'СБП',
    fiscalReceiptStatus: 'issued',
    fiscalReceiptNumber: 'ФД-004807',
    fnNumber: '9960440301984210',
    fdNumber: '4807',
    fpdNumber: '4920194821',
    inn: '772819401823',
    taxPayerName: 'ИП Смирнова Елена Александровна',
    fiscalQrString: 't=20260925T1105&s=2490.00&fn=9960440301984210&i=4807&fp=4920194821&n=1',
  },
  {
    id: 'tx-107',
    transactionNumber: 'CHK-2026-0920-07',
    userId: 'usr-6',
    userName: 'Мария Лебедева',
    userEmail: 'mariya.beauty@inbox.ru',
    payerType: 'individual',
    dateTime: '2026-09-20 09:05:14',
    planId: 'analytics',
    planName: 'Тариф Analytics (Месяц) — без генератора',
    amountRub: 990,
    amountUsd: 11.9,
    gptTunnelCostRub: 60,
    grossProfitRub: 930,
    paymentMethod: 'Банковская карта (МИР/Visa)',
    fiscalReceiptStatus: 'issued',
    fiscalReceiptNumber: 'ФД-004806',
    fnNumber: '9960440301984210',
    fdNumber: '4806',
    fpdNumber: '9184029184',
    inn: '772819401823',
    taxPayerName: 'ИП Смирнова Елена Александровна',
    fiscalQrString: 't=20260920T0905&s=990.00&fn=9960440301984210&i=4806&fp=9184029184&n=1',
  },
  {
    id: 'tx-108',
    transactionNumber: 'CHK-2026-0915-08',
    userId: 'usr-4',
    userName: 'София Миллер',
    userEmail: 'sofia.nordic@gmail.com',
    payerType: 'individual',
    dateTime: '2026-09-15 15:45:30',
    planId: 'credits-pack-500',
    planName: 'Пакет +500 кредитов (Roll-over)',
    amountRub: 1450,
    amountUsd: 17.5,
    gptTunnelCostRub: 210,
    grossProfitRub: 1240,
    paymentMethod: 'Tinkoff Pay',
    fiscalReceiptStatus: 'issued',
    fiscalReceiptNumber: 'ФД-004805',
    fnNumber: '9960440301984210',
    fdNumber: '4805',
    fpdNumber: '3910482019',
    inn: '772819401823',
    taxPayerName: 'ИП Смирнова Елена Александровна',
    fiscalQrString: 't=20260915T1545&s=1450.00&fn=9960440301984210&i=4805&fp=3910482019&n=1',
  },
  {
    id: 'tx-109',
    transactionNumber: 'CHK-2026-0910-09',
    userId: 'usr-2',
    userName: 'Анастасия Ковалёва',
    userEmail: 'nastya.decor@mail.ru',
    payerType: 'individual',
    dateTime: '2026-09-10 18:22:11',
    planId: 'agency',
    planName: 'Тариф Agency (Месяц) + 4000 кредитов',
    amountRub: 14900,
    amountUsd: 179,
    gptTunnelCostRub: 1680,
    grossProfitRub: 13220,
    paymentMethod: 'Банковская карта (МИР/Visa)',
    fiscalReceiptStatus: 'issued',
    fiscalReceiptNumber: 'ФД-004804',
    fnNumber: '9960440301984210',
    fdNumber: '4804',
    fpdNumber: '2948102948',
    inn: '772819401823',
    taxPayerName: 'ИП Смирнова Елена Александровна',
    fiscalQrString: 't=20260910T1822&s=14900.00&fn=9960440301984210&i=4804&fp=2948102948&n=1',
  },
];

export interface TaxCalculationResult {
  totalRevenue: number;
  totalGptTunnelCost: number;
  grossProfit: number;
  taxAmount: number;
  netProfit: number;
  marginPercent: number;
  effectiveTaxRate: number;
  taxDescription: string;
}

export const calculateTax = (
  transactions: TransactionRecord[],
  regime: TaxRegime
): TaxCalculationResult => {
  const totalRevenue = transactions.reduce((acc, t) => acc + t.amountRub, 0);
  const totalGptTunnelCost = transactions.reduce((acc, t) => acc + t.gptTunnelCostRub, 0);
  const grossProfit = totalRevenue - totalGptTunnelCost;

  let taxAmount = 0;
  let taxDescription = '';
  let effectiveTaxRate = 0;

  switch (regime) {
    case 'self_employed': {
      // 4% от физлиц + 6% от юрлиц/ИП
      const indRev = transactions
        .filter((t) => t.payerType === 'individual')
        .reduce((sum, t) => sum + t.amountRub, 0);
      const legRev = transactions
        .filter((t) => t.payerType === 'legal_entity')
        .reduce((sum, t) => sum + t.amountRub, 0);
      taxAmount = Math.round(indRev * 0.04 + legRev * 0.06);
      effectiveTaxRate = totalRevenue > 0 ? (taxAmount / totalRevenue) * 100 : 4.0;
      taxDescription = `НПД: 4% с физлиц (${Math.round(indRev * 0.04).toLocaleString()} ₽) + 6% с юрлиц (${Math.round(legRev * 0.06).toLocaleString()} ₽)`;
      break;
    }
    case 'usn_income_6': {
      // 6% от всех доходов
      taxAmount = Math.round(totalRevenue * 0.06);
      effectiveTaxRate = 6.0;
      taxDescription = 'УСН «Доходы» 6% со всей выручки (до вычета страховых взносов)';
      break;
    }
    case 'usn_profit_15': {
      // 15% от (Доходы - Расходы на gpttunnel)
      taxAmount = Math.max(Math.round(totalRevenue * 0.01), Math.round(grossProfit * 0.15));
      effectiveTaxRate = totalRevenue > 0 ? (taxAmount / totalRevenue) * 100 : 15.0;
      taxDescription = 'УСН «Доходы минус Расходы» 15% от налогооблагаемой базы (Выручка - gpttunnel)';
      break;
    }
    case 'patent': {
      // Патент (ПСН) - фиксированный ежемесячный взнос (~3 500 ₽/мес на IT-услуги)
      taxAmount = 3500;
      effectiveTaxRate = totalRevenue > 0 ? (taxAmount / totalRevenue) * 100 : 0;
      taxDescription = 'Патентная система налогообложения (фиксированная ставка ~3 500 ₽/мес)';
      break;
    }
  }

  const netProfit = grossProfit - taxAmount;
  const marginPercent = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

  return {
    totalRevenue,
    totalGptTunnelCost,
    grossProfit,
    taxAmount,
    netProfit,
    marginPercent,
    effectiveTaxRate: Math.round(effectiveTaxRate * 10) / 10,
    taxDescription,
  };
};

export const exportTransactionsToCsv = (transactions: TransactionRecord[]): string => {
  const headers = [
    'Номер чека',
    'Дата и время',
    'Клиент (ФИО)',
    'Email',
    'Тип плательщика',
    'Тариф / Услуга',
    'Сумма (₽)',
    'Расход GPT-Tunnel (₽)',
    'Валовая прибыль (₽)',
    'Способ оплаты',
    'Фискальный накопитель (ФН)',
    'Номер чека (ФД)',
    'Фискальный признак (ФПД)',
    'Статус ФНС',
  ];

  const rows = transactions.map((t) => [
    `"${t.fiscalReceiptNumber}"`,
    `"${t.dateTime}"`,
    `"${t.userName}"`,
    `"${t.userEmail}"`,
    `"${t.payerType === 'legal_entity' ? 'Юрлицо/ИП' : 'Физлицо'}"`,
    `"${t.planName}"`,
    t.amountRub,
    t.gptTunnelCostRub,
    t.grossProfitRub,
    `"${t.paymentMethod}"`,
    `"${t.fnNumber}"`,
    `"${t.fdNumber}"`,
    `"${t.fpdNumber}"`,
    `"${t.fiscalReceiptStatus === 'issued' ? 'Сформирован и отправлен в ФНС' : 'В обработке'}"`,
  ]);

  return [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
};

import React from 'react';
import { LegalPage } from './LegalPage';
import termsRu from '../legal/terms.ru.md?raw';
import termsEn from '../legal/terms.en.md?raw';

export const TermsOfService: React.FC = () => <LegalPage ru={termsRu} en={termsEn} />;

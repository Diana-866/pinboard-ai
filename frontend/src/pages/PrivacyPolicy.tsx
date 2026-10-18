import React from 'react';
import { LegalPage } from './LegalPage';
import policyRu from '../legal/privacy-policy.ru.md?raw';
import policyEn from '../legal/privacy-policy.en.md?raw';

export const PrivacyPolicy: React.FC = () => <LegalPage ru={policyRu} en={policyEn} />;

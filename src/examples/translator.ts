import { v2 } from '@google-cloud/translate';

import type { TranslatablePayload } from '../mongoose.types';

// Contents dynamic on demand translations
export const getGoogleTranslations = async ({ text, from, to }: TranslatablePayload): Promise<string[]> => {
  // require environment variable GOOGLE_API_KEY
  if (!process.env.GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY is required to use mongoose translation plugin');
  // Instantiates a client
  const Translator = new v2.Translate({ key: process.env.GOOGLE_API_KEY });
  const [translations] = await Translator.translate(text, { from, to, model: 'nmt' });
  return Array.isArray(translations) ? translations : [translations];
};

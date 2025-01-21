import { v2 } from '@google-cloud/translate';
import debug from 'debug';
import type { TranslationProvider, TranslatorFunction } from '../mongoose.types';

const debugLog = debug('mtpdemo:translator:googleAdapter');

export class GoogleTranslator implements TranslationProvider {
  private APIKey: string;

  private translator: v2.Translate;

  constructor() {
    this.APIKey = process.env.GOOGLE_API_KEY || '';
    if (!this.APIKey) {
      throw new Error('GOOGLE_API_KEY is required in environment variables');
    }
    debugLog('Google Api Key is set');
    this.translator = new v2.Translate({ key: this.APIKey });
  }

  private async validateLanguage(language: string): Promise<void> {
    const sourceLanguages = await this.translator.getLanguages();
    for (let i = 0; i < sourceLanguages.length; i++) {
      const lang = sourceLanguages[i];
      if (lang.code === language) {
        debugLog(`using language: ${lang.name} (${lang.code})`);
        return;
      }
    }
    throw new Error(`Language ${language} not supported by Google Translate`);
  }

  public getTranslations: TranslatorFunction = async ({ text, from, to }) => {
    await this.validateLanguage(from);
    await this.validateLanguage(to);
    debugLog(`Translating ${text} from ${from} to ${to}`);
    try {
      const [translations, metadata] = await this.translator.translate(text, {
        from,
        to,
        model: 'nmt'
      });
      debugLog(`Translations: ${translations}, Metadata: ${metadata}`);
      return Array.isArray(translations) ? translations : [translations];
    } catch (error) {
      const err = error as Error;
      debugLog(`Translation error: ${err.message}`);
      throw new Error(`Failed to translate text with Google Translate: ${err.message}`);
    }
  };
}

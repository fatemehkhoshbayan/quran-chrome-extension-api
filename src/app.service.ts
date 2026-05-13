import {
  Injectable,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

@Injectable()
export class AppService implements OnModuleInit {
  private privacyPolicyHtml = '';
  private termsHtml = '';

  private readonly publicDir = join(__dirname, 'public');

  onModuleInit(): void {
    this.privacyPolicyHtml = this.loadHtml('privacy-policy.html');
    this.termsHtml = this.loadHtml('terms.html');
  }

  privacyPolicy(): string {
    return this.privacyPolicyHtml;
  }

  terms(): string {
    return this.termsHtml;
  }

  private loadHtml(fileName: string): string {
    try {
      return readFileSync(join(this.publicDir, fileName), 'utf8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(
        `Failed to load ${fileName}: ${message}`,
      );
    }
  }
}

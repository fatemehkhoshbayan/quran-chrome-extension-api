import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
  UseGuards,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedRequest } from '../auth/session-auth.guard';
import { UserService } from './user.service';
import { verifyExtensionSecret } from '../common/verify-secret';

@Controller('user')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {}

  private validateSecret(secret?: string): void {
    const expected = this.config.get<string>('EXTENSION_SECRET');
    if (!verifyExtensionSecret(secret, expected)) {
      throw new UnauthorizedException();
    }
  }

  @Get('bookmarks')
  @UseGuards(SessionAuthGuard)
  async getBookmarks(
    @Headers('extension_secret') secret: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.logger.log('Matched GET /user/bookmarks', {
      sessionId: this.shortId(req.sessionId),
    });
    this.validateSecret(secret);
    return this.userService.getBookmarks(req.sessionData.accessToken);
  }

  @Post('bookmarks')
  @UseGuards(SessionAuthGuard)
  async addBookmark(
    @Headers('extension_secret') secret: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { key: number; verseNumber: number },
  ) {
    this.logger.log('Matched POST /user/bookmarks', {
      sessionId: this.shortId(req.sessionId),
      body,
    });
    this.validateSecret(secret);
    if (!body?.key || !body?.verseNumber) {
      throw new BadRequestException('key and verseNumber are required');
    }
    return this.userService.addBookmark(
      req.sessionData.accessToken,
      body.key,
      body.verseNumber,
    );
  }

  @Delete('bookmarks/:id')
  @UseGuards(SessionAuthGuard)
  async deleteBookmark(
    @Param('id') id: string,
    @Headers('extension_secret') secret: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.logger.log('Matched DELETE /user/bookmarks/:id', {
      sessionId: this.shortId(req.sessionId),
      bookmarkId: id,
    });
    this.validateSecret(secret);
    return this.userService.deleteBookmark(req.sessionData.accessToken, id);
  }

  @Get('preferences')
  @UseGuards(SessionAuthGuard)
  async getPreferences(
    @Headers('extension_secret') secret: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.validateSecret(secret);
    return this.userService.getPreferences(req.sessionData.sub);
  }

  @Put('preferences')
  @UseGuards(SessionAuthGuard)
  async updatePreferences(
    @Headers('extension_secret') secret: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { translationId?: number; languageIso?: string },
  ) {
    this.validateSecret(secret);
    if (!body?.translationId || !body?.languageIso) {
      throw new BadRequestException('translationId and languageIso are required');
    }
    return this.userService.updateTranslationPreference(
      req.sessionData.sub,
      body.translationId,
      body.languageIso,
    );
  }

  private shortId(value: string | undefined): string {
    return value ? `${value.slice(0, 8)}...` : '<missing>';
  }
}

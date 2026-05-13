import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedRequest } from '../auth/session-auth.guard';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {}

  private validateSecret(secret?: string): void {
    if (secret !== this.config.get<string>('EXTENSION_SECRET')) {
      throw new UnauthorizedException();
    }
  }

  @Get('bookmarks')
  @UseGuards(SessionAuthGuard)
  async getBookmarks(
    @Headers('extension_secret') secret: string,
    @Req() req: AuthenticatedRequest,
  ) {
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
    this.validateSecret(secret);
    return this.userService.deleteBookmark(req.sessionData.accessToken, id);
  }
}

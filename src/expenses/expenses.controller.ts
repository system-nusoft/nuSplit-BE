import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  id: string;
  email: string;
}

@UseGuards(JwtAuthGuard)
@Controller('groups/:groupId/expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post('scan')
  @UseInterceptors(FileInterceptor('receipt'))
  async scanReceipt(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.expensesService.scanReceipt(user.id, groupId, file);
  }

  @Post()
  async createExpense(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.createExpense(user.id, groupId, dto);
  }

  @Get()
  async getExpenses(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.expensesService.getExpenses(
      user.id,
      groupId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Patch(':expenseId')
  async updateExpense(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.updateExpense(user.id, groupId, expenseId, dto);
  }

  @Delete(':expenseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteExpense(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
  ) {
    await this.expensesService.deleteExpense(user.id, groupId, expenseId);
  }

  @Post(':expenseId/comments')
  async createComment(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.expensesService.createComment(user.id, groupId, expenseId, dto);
  }

  @Get(':expenseId/comments')
  async getComments(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
  ) {
    return this.expensesService.getComments(user.id, groupId, expenseId);
  }

  @Delete(':expenseId/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteComment(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
    @Param('commentId') commentId: string,
  ) {
    await this.expensesService.deleteComment(user.id, groupId, expenseId, commentId);
  }
}

import {
  Controller,
  Get,
  Injectable,
  Module,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly db: DatabaseService) {}

  async findActiveCategories() {
    const res = await this.db.query(
      `SELECT c.id, c.slug, c.name, c.icon,
              c.department_id AS "departmentId",
              d.name AS "departmentName",
              d.response_deadline_days AS "responseDeadlineDays",
              c.execution_deadline_days AS "executionDeadlineDays",
              c.active
       FROM categories c
       JOIN departments d ON d.id = c.department_id
       WHERE c.active = TRUE
       ORDER BY c.name ASC`,
    );
    return res.rows;
  }
}

@ApiTags('Categorias')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as 7 categorias ativas de zeladoria urbana' })
  async findAll() {
    return this.categoriesService.findActiveCategories();
  }
}

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}

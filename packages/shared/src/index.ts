import { z } from 'zod';

export enum UserRole {
  CITIZEN = 'citizen',
  TRIAGE = 'triage',
  DEPARTMENT = 'department',
  MANAGER = 'manager',
  ADMIN = 'admin',
}

export enum OccurrenceStatus {
  RECEIVED = 'received',
  IN_REVIEW = 'in_review',
  FORWARDED = 'forwarded',
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  REJECTED = 'rejected',
}

export const OCCURRENCE_STATUS_LABELS: Record<OccurrenceStatus, string> = {
  [OccurrenceStatus.RECEIVED]: 'Recebida',
  [OccurrenceStatus.IN_REVIEW]: 'Em análise',
  [OccurrenceStatus.FORWARDED]: 'Encaminhada',
  [OccurrenceStatus.SCHEDULED]: 'Programada',
  [OccurrenceStatus.IN_PROGRESS]: 'Em andamento',
  [OccurrenceStatus.DONE]: 'Concluída',
  [OccurrenceStatus.REJECTED]: 'Não procedente',
};

export enum OccurrencePriority {
  HIGH = 'alta',
  MEDIUM = 'media',
  LOW = 'baixa',
}

export const OCCURRENCE_PRIORITY_LABELS: Record<OccurrencePriority, string> = {
  [OccurrencePriority.HIGH]: 'Alta',
  [OccurrencePriority.MEDIUM]: 'Média',
  [OccurrencePriority.LOW]: 'Baixa',
};

export enum TextSizePref {
  DEFAULT = 'default',
  LARGE = 'large',
  XLARGE = 'xlarge',
}

export const NEIGHBORHOODS = [
  'Centro',
  'Zona Norte',
  'Vila Nova',
  'Jardim das Flores',
] as const;

export const RegisterCitizenSchema = z.object({
  name: z.string().min(3, 'Informe seu nome completo (mínimo 3 caracteres).'),
  email: z.string().email('Informe um e-mail válido.'),
  phone: z.string().optional(),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres.'),
  lgpdConsent: z.literal(true, {
    errorMap: () => ({
      message: 'Você precisa aceitar o termo de consentimento LGPD para criar uma conta.',
    }),
  }),
});

export const LoginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});

export const STAFF_ROLES = [
  UserRole.TRIAGE,
  UserRole.DEPARTMENT,
  UserRole.MANAGER,
  UserRole.ADMIN,
] as const;

/** Cadastro de usuário de atendimento (somente Administrador). */
export const CreateStaffUserSchema = z
  .object({
    name: z.string().trim().min(3, 'Informe o nome completo (mínimo 3 caracteres).').max(140),
    email: z.string().trim().email('Informe um e-mail válido.').max(180),
    password: z.string().min(8, 'A senha inicial deve ter no mínimo 8 caracteres.').max(128),
    role: z.enum(STAFF_ROLES, {
      errorMap: () => ({ message: 'Selecione um perfil de atendimento válido.' }),
    }),
    departmentId: z.string().uuid('Selecione um departamento válido.').optional(),
  })
  .superRefine((val, ctx) => {
    if (val.role === UserRole.DEPARTMENT && !val.departmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['departmentId'],
        message: 'O perfil Departamento exige a escolha do departamento.',
      });
    }
  });

/** Edição de usuário de atendimento (somente Administrador). */
export const UpdateStaffUserSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome completo (mínimo 3 caracteres).').max(140).optional(),
  role: z.enum(STAFF_ROLES, {
    errorMap: () => ({ message: 'Selecione um perfil de atendimento válido.' }),
  }).optional(),
  departmentId: z.string().uuid('Selecione um departamento válido.').nullable().optional(),
  active: z.boolean().optional(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: z.string().min(8, 'A nova senha deve ter no mínimo 8 caracteres.').max(128),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(20, 'Link de redefinição inválido.').max(200),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres.').max(128),
});

export const CreateOccurrenceSchema = z.object({
  categoryId: z.string().uuid('Selecione uma categoria válida.'),
  title: z.string().min(5, 'O título deve ter pelo menos 5 caracteres.').max(120).optional(),
  description: z
    .string()
    .min(10, 'A descrição deve ter no mínimo 10 caracteres para ajudar na análise.')
    .max(2000, 'A descrição pode ter no máximo 2000 caracteres.'),
  referencePoint: z.string().max(200).optional(),
  addressText: z.string().min(5, 'Informe o endereço ou local aproximado.'),
  neighborhood: z.string().min(2, 'Informe o bairro.'),
  latitude: z.coerce
    .number()
    .min(-90, 'Latitude inválida.')
    .max(90, 'Latitude inválida.'),
  longitude: z.coerce
    .number()
    .min(-180, 'Longitude inválida.')
    .max(180, 'Longitude inválida.'),
  requesterName: z.string().max(120).optional(),
  requesterContact: z.string().max(160).optional(),
});

export const UpdateOccurrenceAdminSchema = z
  .object({
    status: z.nativeEnum(OccurrenceStatus).optional(),
    priority: z.nativeEnum(OccurrencePriority).optional(),
    departmentId: z.string().uuid().optional(),
    justification: z.string().max(1000).optional(),
  })
  .superRefine((val, ctx) => {
    if (
      val.status === OccurrenceStatus.REJECTED &&
      (!val.justification || val.justification.trim().length < 5)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['justification'],
        message: 'Para Não procedente, a justificativa é obrigatória e fica visível ao cidadão.',
      });
    }
  });

export const CreateRatingSchema = z.object({
  stars: z.coerce.number().int().min(1, 'Selecione de 1 a 5 estrelas.').max(5),
  comment: z.string().max(500).optional(),
  /** Protocolo da solicitação: exigido quando ela foi registrada sem conta. */
  protocol: z.string().max(24).optional(),
});

export const UpdateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Informe seu nome completo (mínimo 3 caracteres).')
    .max(140)
    .optional(),
  phone: z.string().trim().max(40).optional(),
});

export const UpdatePreferencesSchema = z.object({
  textSizePref: z.nativeEnum(TextSizePref).optional(),
  highContrastPref: z.boolean().optional(),
  reduceMotionPref: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
});

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  OccurrenceStatus,
} from '@cidade-em-foco/shared';
import { TOKENS } from '../theme/tokens';

export const StatusBadge: React.FC<{
  status: OccurrenceStatus;
  highContrast?: boolean;
  scale?: number;
}> = ({ status, highContrast = false, scale = 1 }) => {
  const cfg = TOKENS.status[status] || TOKENS.status[OccurrenceStatus.RECEIVED];
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Estado: ${cfg.label}`}
      style={[
        styles.badge,
        {
          backgroundColor: cfg.bg,
          borderColor: highContrast ? '#000000' : 'transparent',
          borderWidth: highContrast ? 1.5 : 0,
        },
      ]}
    >
      <Text style={{ fontSize: 13 * scale }}>{cfg.icon}</Text>
      <Text
        style={[
          styles.badgeText,
          { color: highContrast ? '#000000' : cfg.fg, fontSize: 13 * scale },
        ]}
      >
        {cfg.label}
      </Text>
    </View>
  );
};

export const EmergencyBanner: React.FC<{ scale?: number }> = ({ scale = 1 }) => (
  <View
    accessible
    accessibilityRole="alert"
    style={styles.emergencyBanner}
  >
    <Text style={{ fontSize: 16 * scale }}>⚠️</Text>
    <Text style={[styles.emergencyText, { fontSize: 13 * scale }]}>
      <Text style={{ fontWeight: '700' }}>
        Esta plataforma não é canal de emergência.{' '}
      </Text>
      Em emergência, ligue <Text style={{ fontWeight: '700' }}>190</Text>,{' '}
      <Text style={{ fontWeight: '700' }}>192</Text> ou{' '}
      <Text style={{ fontWeight: '700' }}>193</Text>.
    </Text>
  </View>
);

export const NoticeBox: React.FC<{
  variant?: 'info' | 'warning' | 'danger';
  children: React.ReactNode;
  scale?: number;
}> = ({ variant = 'info', children, scale = 1 }) => {
  const bg =
    variant === 'danger'
      ? '#fbe3dd'
      : variant === 'warning'
        ? '#fbeccf'
        : TOKENS.brandSoft;
  const fg =
    variant === 'danger'
      ? '#b02a14'
      : variant === 'warning'
        ? '#8a5200'
        : TOKENS.brand;

  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 13 * scale, fontWeight: '600' }}>
        {children as never}
      </Text>
    </View>
  );
};

export const PrimaryButton: React.FC<{
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  scale?: number;
}> = ({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  scale = 1,
}) => {
  const bg =
    variant === 'primary'
      ? TOKENS.brand
      : variant === 'danger'
        ? '#b02a14'
        : variant === 'secondary'
          ? TOKENS.surface200
          : 'transparent';
  const fg =
    variant === 'primary' || variant === 'danger'
      ? '#ffffff'
      : variant === 'secondary'
        ? TOKENS.ink
        : TOKENS.brand;
  const borderColor =
    variant === 'secondary' ? TOKENS.lineStrong : 'transparent';

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: variant === 'secondary' ? 1 : 0,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <Text style={[styles.buttonText, { color: fg, fontSize: 15 * scale }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export const ChipButton: React.FC<{
  label: string;
  active?: boolean;
  onPress: () => void;
  scale?: number;
}> = ({ label, active = false, onPress, scale = 1 }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={[
      styles.chip,
      {
        backgroundColor: active ? TOKENS.brand : TOKENS.surface200,
        borderColor: active ? TOKENS.brand : TOKENS.lineStrong,
      },
    ]}
  >
    <Text
      style={{
        color: active ? '#ffffff' : TOKENS.ink,
        fontWeight: '600',
        fontSize: 13 * scale,
      }}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

export const FieldInput: React.FC<{
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  error?: string | null;
  hint?: string;
  scale?: number;
}> = ({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  secureTextEntry = false,
  keyboardType = 'default',
  error,
  hint,
  scale = 1,
}) => (
  <View style={styles.fieldWrapper}>
    <Text style={[styles.fieldLabel, { fontSize: 14 * scale }]}>{label}</Text>
    {hint && (
      <Text style={[styles.fieldHint, { fontSize: 12 * scale }]}>{hint}</Text>
    )}
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={TOKENS.inkMuted}
      multiline={multiline}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={keyboardType === 'email-address' || secureTextEntry ? 'none' : 'sentences'}
      autoCorrect={keyboardType !== 'email-address' && !secureTextEntry}
      style={[
        styles.input,
        multiline && { minHeight: 100, textAlignVertical: 'top' },
        error ? { borderColor: '#b02a14', borderWidth: 2 } : null,
        { fontSize: 15 * scale },
      ]}
    />
    {error && (
      <Text
        accessibilityRole="alert"
        style={[styles.fieldError, { fontSize: 12 * scale }]}
      >
        ⚠️ {error}
      </Text>
    )}
  </View>
);

export const StepperBar: React.FC<{
  currentStep: number;
  steps: string[];
  scale?: number;
}> = ({ currentStep, steps, scale = 1 }) => (
  <View
    accessible
    accessibilityLabel={`Passo ${currentStep} de ${steps.length}: ${
      steps[currentStep - 1]
    }`}
    style={styles.stepperRow}
  >
    {steps.map((stepLabel, idx) => {
      const stepNum = idx + 1;
      const active = stepNum <= currentStep;
      return (
        <View key={stepLabel} style={styles.stepperCol}>
          <View
            style={[
              styles.stepperLine,
              { backgroundColor: active ? TOKENS.brand : TOKENS.line },
            ]}
          />
          <Text
            style={{
              fontSize: 11 * scale,
              fontWeight: stepNum === currentStep ? '700' : '500',
              color: stepNum === currentStep ? TOKENS.brand : TOKENS.inkMuted,
            }}
          >
            {stepNum}. {stepLabel}
          </Text>
        </View>
      );
    })}
  </View>
);

export const StarsRating: React.FC<{
  value: number;
  onChange?: (stars: number) => void;
  readOnly?: boolean;
}> = ({ value, onChange, readOnly = false }) => (
  <View
    accessibilityRole="radiogroup"
    accessibilityLabel="Avaliação de 1 a 5 estrelas"
    style={{ flexDirection: 'row', gap: 8 }}
  >
    {[1, 2, 3, 4, 5].map((star) => {
      const filled = star <= value;
      return (
        <TouchableOpacity
          key={star}
          disabled={readOnly}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === star }}
          accessibilityLabel={`${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
          onPress={() => onChange?.(star)}
          style={styles.starBtn}
        >
          <Text style={{ fontSize: 22 }}>{filled ? '⭐' : '☆'}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontWeight: '700',
  },
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fbeccf',
    borderColor: '#e2c285',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
  },
  emergencyText: {
    flex: 1,
    color: '#8a5200',
    lineHeight: 19,
  },
  notice: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TOKENS.line,
  },
  button: {
    minHeight: 48,
    borderRadius: 999,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonText: {
    fontWeight: '700',
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  fieldWrapper: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontWeight: '700',
    color: TOKENS.ink,
    marginBottom: 4,
  },
  fieldHint: {
    color: TOKENS.inkMuted,
    marginBottom: 4,
  },
  input: {
    minHeight: 48,
    backgroundColor: TOKENS.surface200,
    borderColor: TOKENS.lineStrong,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: TOKENS.ink,
  },
  fieldError: {
    color: '#b02a14',
    fontWeight: '600',
    marginTop: 4,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 8,
  },
  stepperCol: {
    flex: 1,
  },
  stepperLine: {
    height: 6,
    borderRadius: 999,
    marginBottom: 4,
  },
  starBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TOKENS.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.surface200,
  },
});

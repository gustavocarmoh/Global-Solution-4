import React from 'react';
import {
  Construction,
  Lightbulb,
  Trash2,
  Accessibility,
  Signpost,
  Trees,
  Droplets,
  HelpCircle,
} from 'lucide-react';
export type { CategoryItem } from '../lib/queries';

export const CategoryIcon: React.FC<{ icon?: string; slug?: string; size?: number }> = ({
  icon,
  slug,
  size = 22,
}) => {
  const key = (icon || slug || '').toLowerCase();
  if (key.includes('road') || key.includes('paviment')) {
    return <Construction size={size} aria-hidden="true" />;
  }
  if (key.includes('light') || key.includes('ilumin')) {
    return <Lightbulb size={size} aria-hidden="true" />;
  }
  if (key.includes('trash') || key.includes('limpez')) {
    return <Trash2 size={size} aria-hidden="true" />;
  }
  if (key.includes('wheel') || key.includes('acessib')) {
    return <Accessibility size={size} aria-hidden="true" />;
  }
  if (key.includes('sign') || key.includes('sinaliz')) {
    return <Signpost size={size} aria-hidden="true" />;
  }
  if (key.includes('tree') || key.includes('verde')) {
    return <Trees size={size} aria-hidden="true" />;
  }
  if (key.includes('drop') || key.includes('drenag')) {
    return <Droplets size={size} aria-hidden="true" />;
  }
  return <HelpCircle size={size} aria-hidden="true" />;
};

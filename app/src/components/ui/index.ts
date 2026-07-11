/**
 * Shared UI component barrel.
 *
 * Re-export every reusable UI component from this module so consumers
 * write one import path regardless of how the component files are
 * organised internally:
 *
 *   import { Button, Card, Badge } from "@/components/ui";
 *
 * Add new exports here as components are created.
 */

export { Button, type ButtonProps } from "./Button";
export { Badge, resolveBadgeStatus, type BadgeProps } from "./Badge";
export {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  type CardProps,
} from "./Card";
export { Input, type InputProps } from "./Input";
export { Avatar, getInitials, type AvatarProps } from "./Avatar";
export { StatCard, type StatCardProps } from "./StatCard";
export { Skeleton } from "./Skeleton";
export {
  LanguageSwitcher,
  type LanguageSwitcherProps,
} from "./LanguageSwitcher";
export { AuthHeroPanel } from "./AuthHeroPanel";
export { FileDropzone, type FileDropzoneProps } from "./FileDropzone";
export { ProgressBar, type ProgressBarProps } from "./ProgressBar";
export type { ButtonVariant, ButtonSize, BadgeStatus } from "./variants";

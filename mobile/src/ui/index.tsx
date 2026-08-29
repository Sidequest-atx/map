import * as Haptics from "expo-haptics";
import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { C, R, SEV_BG, SEV_COLOR, SP, T, shadow1 } from "../theme";
import { SEVERITY_LABELS, STATUS_LABELS, type ReportStatus, type Severity } from "../types";

/* ---------- Layout ---------- */

export function Screen({ children, scroll = true, padded = true, style, bottom }: { children: ReactNode; scroll?: boolean; padded?: boolean; style?: StyleProp<ViewStyle>; bottom?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const inner = padded ? { padding: SP.lg, paddingBottom: SP.xxl + insets.bottom } : { paddingBottom: insets.bottom };
  return (
    <View style={[styles.screen, style]}>
      {scroll ? (
        <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
      {bottom ? <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, SP.md) }]}>{bottom}</View> : null}
    </View>
  );
}

export { SafeAreaView };

export function Stack({ children, gap = SP.md, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Row({ children, gap = SP.sm, style, align = "center", justify }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: ViewStyle["alignItems"]; justify?: ViewStyle["justifyContent"] }) {
  return <View style={[{ flexDirection: "row", alignItems: align, justifyContent: justify, gap, flexWrap: "wrap" }, style]}>{children}</View>;
}

export function Card({ children, style, tone = "surface" }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: "surface" | "field" | "olive" }) {
  const bg = tone === "olive" ? C.olive800 : tone === "field" ? C.field2 : C.surface;
  return <View style={[styles.card, { backgroundColor: bg }, tone === "surface" ? shadow1 : null, style]}>{children}</View>;
}

/* ---------- Type ---------- */

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[T.h1, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[T.h2, style]}>{children}</Text>;
}
export function P({ children, style, soft }: { children: ReactNode; style?: StyleProp<TextStyle>; soft?: boolean }) {
  return <Text style={[soft ? T.bodySoft : T.body, style]}>{children}</Text>;
}
export function Small({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[T.small, style]}>{children}</Text>;
}
export function Micro({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[T.micro, style]}>{children}</Text>;
}
export function Mono({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[T.mono, style]}>{children}</Text>;
}
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[T.label, style]}>{children}</Text>;
}

/* ---------- Buttons ---------- */

type Variant = "primary" | "default" | "ghost" | "danger" | "dark";
export function Button({
  title,
  onPress,
  variant = "default",
  size = "md",
  disabled,
  loading,
  block,
  icon,
  style,
  haptic = true,
  ...rest
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
} & Omit<PressableProps, "style" | "onPress" | "disabled">) {
  const bg = variant === "primary" ? C.olive600 : variant === "dark" ? C.olive800 : variant === "danger" ? C.danger : variant === "ghost" ? "transparent" : C.surface;
  const fg = variant === "primary" || variant === "dark" || variant === "danger" ? C.inkOnDark : variant === "ghost" ? C.olive800 : C.ink;
  const border = variant === "default" ? C.line : "transparent";
  const pad = size === "sm" ? { paddingVertical: 7, paddingHorizontal: 12 } : size === "lg" ? { paddingVertical: 15, paddingHorizontal: 22 } : { paddingVertical: 11, paddingHorizontal: 16 };
  const fs = size === "sm" ? 13.5 : size === "lg" ? 17 : 15.5;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.btn,
        pad,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        block ? { alignSelf: "stretch" } : null,
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text style={{ color: fg, fontSize: fs, fontWeight: "600", letterSpacing: -0.1 }}>{title}</Text>
    </Pressable>
  );
}

/* ---------- Badges, chips, notices ---------- */

export function SevBadge({ s }: { s: Severity }) {
  return (
    <View style={[styles.badge, { backgroundColor: SEV_BG[s] }]}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SEV_COLOR[s] }} />
      <Text style={[styles.badgeText, { color: C.ink }]}>{SEVERITY_LABELS[s]}</Text>
    </View>
  );
}

export function StatusBadge({ s }: { s: ReportStatus }) {
  const bg = s === "resolved" ? C.okBg : s === "open" ? C.field3 : C.infoBg;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{STATUS_LABELS[s]}</Text>
    </View>
  );
}

export function Badge({ children, tone = "field" }: { children: ReactNode; tone?: "field" | "ai" | "ok" | "warn" | "danger" | "olive" }) {
  const bg = tone === "ai" ? C.infoBg : tone === "ok" ? C.okBg : tone === "warn" ? C.sevModerateBg : tone === "danger" ? C.dangerBg : tone === "olive" ? C.olive100 : C.field3;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{children}</Text>
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on ? styles.chipOn : null]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on ? { color: C.inkOnDark } : null]}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ children, tone = "info", style }: { children: ReactNode; tone?: "info" | "warn" | "danger" | "ok"; style?: StyleProp<ViewStyle> }) {
  const bg = tone === "warn" ? C.sevModerateBg : tone === "danger" ? C.dangerBg : tone === "ok" ? C.okBg : C.field2;
  const bar = tone === "warn" ? C.sevModerate : tone === "danger" ? C.danger : tone === "ok" ? C.ok : C.olive500;
  return (
    <View style={[styles.notice, { backgroundColor: bg }, style]}>
      <View style={{ width: 3, borderRadius: 2, backgroundColor: bar, alignSelf: "stretch" }} />
      <View style={{ flex: 1, gap: 6 }}>{typeof children === "string" ? <P>{children}</P> : children}</View>
    </View>
  );
}

/* ---------- Inputs ---------- */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      {children}
      {hint ? <Small>{hint}</Small> : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={C.inkMute} {...props} style={[styles.input, props.multiline ? { minHeight: 96, textAlignVertical: "top" } : null, props.style]} />;
}

export function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={styles.seg} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.segItem, on ? styles.segOn : null]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <Text style={[styles.segText, on ? { color: C.inkOnDark } : null]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function OptionGrid<K extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { key: K; label: string; hint?: string; dot?: string }[];
  value: K | null;
  onChange: (k: K) => void;
  columns?: 1 | 2;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SP.sm }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(o.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.option, on ? styles.optionOn : null, { width: columns === 2 ? "48%" : "100%", flexGrow: 1 }]}
          >
            <Row gap={6}>
              {o.dot ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: o.dot }} /> : null}
              <Text style={[styles.optionText, on ? { color: C.inkOnDark } : null]}>{o.label}</Text>
            </Row>
            {o.hint ? <Text style={[T.micro, on ? { color: C.inkOnDarkSoft } : null]}>{o.hint}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: SP.sm }} />;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <H2 style={{ textAlign: "center" }}>{title}</H2>
      <P soft style={{ textAlign: "center" }}>
        {body}
      </P>
      {action}
    </View>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <View style={styles.progress}>
      <View style={[styles.progressBar, { width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }]} />
    </View>
  );
}

export function KPI({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: C.ink, letterSpacing: -0.4, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Micro>{label}</Micro>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.field },
  bottomBar: { paddingHorizontal: SP.lg, paddingTop: SP.md, backgroundColor: C.field, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  card: { borderRadius: R.lg, padding: SP.lg, gap: SP.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: R.md, borderWidth: 1 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3, paddingHorizontal: 9, borderRadius: R.pill, alignSelf: "flex-start" },
  badgeText: { fontSize: 12.5, fontWeight: "600", color: C.ink },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.olive800, borderColor: C.olive800 },
  chipText: { fontSize: 13.5, fontWeight: "600", color: C.ink },
  notice: { flexDirection: "row", gap: SP.md, padding: SP.md, borderRadius: R.md },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: C.ink },
  seg: { flexDirection: "row", backgroundColor: C.field3, borderRadius: R.md, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: R.sm },
  segOn: { backgroundColor: C.olive800 },
  segText: { fontSize: 13.5, fontWeight: "600", color: C.ink },
  option: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: 12, gap: 3 },
  optionOn: { backgroundColor: C.olive800, borderColor: C.olive800 },
  optionText: { fontSize: 15, fontWeight: "600", color: C.ink },
  empty: { alignItems: "center", gap: SP.sm, padding: SP.xl, backgroundColor: C.field2, borderRadius: R.lg },
  progress: { height: 6, backgroundColor: C.field3, borderRadius: 3, overflow: "hidden" },
  progressBar: { height: 6, backgroundColor: C.olive600 },
  kpi: { flex: 1, backgroundColor: C.surface, borderRadius: R.md, padding: SP.md, gap: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
});

import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { signInWithPassword, signUpWithPassword } from "../data/session";
import { C, SP, T } from "../theme";
import { Button, Card, Field, Input, Notice, P, Screen, Segmented, Small, Stack } from "../ui";

/**
 * Real accounts (Supabase email + password). Everyone signs up as a reporter;
 * the moderator role is granted server-side. The session persists on the
 * phone, so this screen appears once per install.
 */
export function SignInScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGo = email.trim().includes("@") && password.length >= 8 && (mode === "signin" || name.trim().length > 0);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await signUpWithPassword(name, email, password);
      else await signInWithPassword(email, password);
      // Success flips the session; App.tsx swaps this screen out.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Stack gap={SP.xl}>
          <View style={styles.hero}>
            <Image source={require("../../assets/splash-icon.png")} style={{ width: 72, height: 72 }} />
            <Text style={T.display}>SideQuest ATX</Text>
            <P soft>Photograph every broken, blocked, or missing sidewalk in Austin. Every photo lands on the shared map with the exact panel it shows.</P>
          </View>
          <Card>
            <Stack gap={SP.lg}>
              <Segmented
                options={[
                  { key: "signup", label: "New account" },
                  { key: "signin", label: "Sign in" },
                ]}
                value={mode}
                onChange={(k) => {
                  setMode(k);
                  setError(null);
                }}
              />
              {mode === "signup" && (
                <Field label="Your name" hint="Shows on each report you submit.">
                  <Input value={name} onChangeText={setName} placeholder="First name" autoCapitalize="words" autoCorrect={false} returnKeyType="next" />
                </Field>
              )}
              <Field label="Email">
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="next"
                />
              </Field>
              <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
                <Input
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  textContentType={mode === "signup" ? "newPassword" : "password"}
                  returnKeyType="go"
                  onSubmitEditing={() => canGo && !busy && void go()}
                />
              </Field>
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <Button
                title={mode === "signup" ? "Create account" : "Sign in"}
                variant="primary"
                size="lg"
                block
                loading={busy}
                onPress={() => void go()}
                disabled={!canGo}
              />
            </Stack>
          </Card>
          <Small style={{ color: C.inkMute }}>
            Photos of the public right-of-way only. No faces, plates, or house numbers get published. Reports are saved on this phone first and
            upload to the shared map whenever there is a connection.
          </Small>
        </Stack>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { gap: SP.md, paddingTop: SP.xl },
});

import React, { useEffect, useRef, useState, type RefObject } from "react";
import { AccessibilityInfo, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { cancelPasswordReset, confirmPasswordReset, getPrefs, requestPasswordReset, signInWithPassword, signUpWithPassword } from "../data/session";
import { getStore } from "../data/store";
import { friendlyAuthError } from "../lib/friendlyError";
import { C, SP, T } from "../theme";
import { Button, Card, Field, Input, Notice, P, Screen, Segmented, Small, Stack } from "../ui";

type Mode = "signup" | "signin" | "reset-request" | "reset-confirm";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A true first run opens on New account; a phone that has been used before opens on Sign in. */
function initialMode(): Mode {
  return getPrefs().lastEmail || getStore().list().length > 0 ? "signin" : "signup";
}

/**
 * Real accounts (Supabase email + password). Everyone signs up as a reporter;
 * the moderator role is granted server-side. The session persists on the
 * phone, so this screen mostly appears once per install. Forgotten passwords
 * reset with an emailed code, so nothing depends on links opening the app.
 */
export function SignInScreen() {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => getPrefs().lastEmail ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    if (next === "reset-request" || next === "reset-confirm") setPassword("");
  }

  /** The button stays enabled; pressing it names exactly what is missing. */
  function missing(): { msg: string; focus: RefObject<TextInput | null> } | null {
    const e = email.trim();
    if (mode === "signup" && !name.trim()) return { msg: "Add your first name. It shows on your reports.", focus: nameRef };
    if (mode !== "reset-confirm" && !EMAIL_OK.test(e)) return { msg: e ? "That email address doesn't look right." : "Enter your email address.", focus: emailRef };
    if (mode === "signup" && password.length < 8) return { msg: "Use at least 8 characters for your password.", focus: passwordRef };
    // Sign in sends whatever was typed: the length rule belongs to creating a password, not using one.
    if (mode === "signin" && !password) return { msg: "Enter your password.", focus: passwordRef };
    if (mode === "reset-confirm") {
      if (!/^\d{6,10}$/.test(code.trim())) return { msg: "Enter the code from the email.", focus: codeRef };
      if (password.length < 8) return { msg: "Use at least 8 characters for your new password.", focus: passwordRef };
    }
    return null;
  }

  async function go() {
    if (busy) return;
    const m = missing();
    if (m) {
      setInfo(null);
      setError(m.msg);
      m.focus.current?.focus();
      return;
    }
    const context = mode;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await signUpWithPassword(name, email, password);
      else if (mode === "signin") await signInWithPassword(email, password);
      else if (mode === "reset-request") {
        await requestPasswordReset(email);
        setCode("");
        setPassword("");
        setMode("reset-confirm");
        setInfo(`If an account exists for ${email.trim()}, we emailed it a code. It can take a minute to arrive.`);
      } else {
        await confirmPasswordReset(email, code, password);
      }
      // A successful sign-in flips the session; App.tsx swaps this screen out.
    } catch (e) {
      console.warn("[auth]", e);
      setInfo(null);
      setError(friendlyAuthError(e, context));
    } finally {
      setBusy(false);
    }
  }

  const resetting = mode === "reset-request" || mode === "reset-confirm";
  const cta = mode === "signup" ? "Create account" : mode === "signin" ? "Sign in" : mode === "reset-request" ? "Email me a code" : "Save new password";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Stack gap={SP.xl}>
          <View style={styles.hero}>
            <Image source={require("../../assets/splash-icon.png")} style={{ width: 72, height: 72 }} accessibilityIgnoresInvertColors />
            <Text style={T.display}>SideQuest ATX</Text>
            <P soft>Photograph broken sidewalks. Every photo lands on Austin's shared map, pinned to the exact spot.</P>
          </View>
          <Card>
            <Stack gap={SP.lg}>
              {resetting ? (
                <View style={{ gap: 4 }}>
                  <Text style={T.h2}>{mode === "reset-request" ? "Reset your password" : "Enter the code"}</Text>
                  <Small>{mode === "reset-request" ? "We'll email you a code. There is no link to tap." : "Type the code from the email, then choose a new password."}</Small>
                </View>
              ) : (
                <Segmented
                  options={[
                    { key: "signup", label: "New account" },
                    { key: "signin", label: "Sign in" },
                  ]}
                  value={mode === "signin" ? "signin" : "signup"}
                  onChange={(k) => switchMode(k)}
                />
              )}
              {mode === "signup" && (
                <Field label="Your name" hint="Shows on each report you submit.">
                  <Input
                    ref={nameRef}
                    value={name}
                    onChangeText={setName}
                    placeholder="First name"
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoComplete="given-name"
                    textContentType="givenName"
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => emailRef.current?.focus()}
                  />
                </Field>
              )}
              {mode === "reset-confirm" ? (
                <Field label="Code from the email">
                  <Input
                    ref={codeRef}
                    value={code}
                    onChangeText={setCode}
                    placeholder="6-digit code"
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    maxLength={10}
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </Field>
              ) : (
                <Field label="Email">
                  <Input
                    ref={emailRef}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    textContentType="username"
                    returnKeyType={mode === "reset-request" ? "send" : "next"}
                    submitBehavior={mode === "reset-request" ? "blurAndSubmit" : "submit"}
                    onSubmitEditing={() => (mode === "reset-request" ? void go() : passwordRef.current?.focus())}
                  />
                </Field>
              )}
              {mode !== "reset-request" && (
                <Field label={mode === "reset-confirm" ? "New password" : "Password"} hint={mode === "signin" ? undefined : "At least 8 characters."}>
                  <Input
                    ref={passwordRef}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    textContentType={mode === "signin" ? "password" : "newPassword"}
                    returnKeyType="go"
                    onSubmitEditing={() => void go()}
                  />
                </Field>
              )}
              {info ? <Notice tone="ok">{info}</Notice> : null}
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <Button title={cta} variant="primary" size="lg" block loading={busy} onPress={() => void go()} />
              {mode === "signin" ? <Button title="Forgot password?" variant="ghost" size="sm" onPress={() => switchMode("reset-request")} /> : null}
              {mode === "reset-confirm" ? <Button title="Send a new code" variant="ghost" size="sm" onPress={() => switchMode("reset-request")} /> : null}
              {resetting ? (
                <Button
                  title="Back to sign in"
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    cancelPasswordReset();
                    switchMode("signin");
                  }}
                />
              ) : null}
            </Stack>
          </Card>
          <Small style={{ color: C.inkMute }}>Public sidewalks only; no faces or plates are ever published. Works offline; reports upload when you have a connection.</Small>
        </Stack>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { gap: SP.md, paddingTop: SP.xl },
});

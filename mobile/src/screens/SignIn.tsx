import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { signIn } from "../data/session";
import { C, SP, T } from "../theme";
import { ROLE_LABELS, type Role } from "../types";
import { Button, Card, Field, Input, OptionGrid, P, Screen, Small, Stack } from "../ui";

const ROLE_HINT: Record<Role, string> = {
  reporter: "Photograph hazards on foot",
  "drive-captain": "Reporter + Quest Drives from the passenger seat",
  moderator: "Everything, plus status changes and close-outs",
};

export function SignInScreen() {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("moderator");
  return (
    <Screen>
      <Stack gap={SP.xl}>
        <View style={styles.hero}>
          <Image source={require("../../assets/splash-icon.png")} style={{ width: 72, height: 72 }} />
          <Text style={T.display}>SideQuest ATX</Text>
          <P soft>Photograph every broken, blocked, or missing sidewalk in Austin. Every photo lands on the map with the exact panel it shows.</P>
        </View>
        <Card>
          <Stack gap={SP.lg}>
            <Field label="Who is holding the phone?" hint="Your name shows on each record you submit.">
              <Input value={name} onChangeText={setName} placeholder="First name" autoCapitalize="words" autoCorrect={false} returnKeyType="done" />
            </Field>
            <Field label="Role">
              <OptionGrid columns={1} options={(Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ key: r, label: ROLE_LABELS[r], hint: ROLE_HINT[r] }))} value={role} onChange={setRole} />
            </Field>
            <Button title="Start" variant="primary" size="lg" block onPress={() => signIn(name, role)} disabled={!name.trim()} />
          </Stack>
        </Card>
        <Small style={{ color: C.inkMute }}>
          Photos of the public right-of-way only. No faces, plates, or house numbers get published. Nothing leaves this phone until you export it.
        </Small>
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: SP.md, paddingTop: SP.xl },
});

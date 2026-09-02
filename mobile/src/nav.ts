import type { NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Home: undefined;
  Report: undefined;
  Drive: undefined;
  GlassesWalk: undefined;
  Reports: undefined;
  ReportDetail: { id: string };
  Settings: undefined;
};

export type RootTabParamList = {
  QuestTab: NavigatorScreenParams<RootStackParamList>;
  MapTab: undefined;
};

export type ScreenProps<K extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, K>;

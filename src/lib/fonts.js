import { Anton, Inter, JetBrains_Mono } from "next/font/google";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--f-display", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--f-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });

export const fontVars = `${anton.variable} ${inter.variable} ${mono.variable}`;

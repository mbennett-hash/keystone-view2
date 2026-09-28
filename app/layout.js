export const metadata = {
  title: "Keystone View",
  description: "Keystone's chart editor and publisher",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}

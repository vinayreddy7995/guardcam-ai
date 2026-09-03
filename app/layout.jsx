export const metadata = {
  title: 'GuardCam AI Shield',
  description: 'Real-Time Deepfake & Fake Police Video Call Scam Detector',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#fafafa' }}>
        {children}
      </body>
    </html>
  );
}
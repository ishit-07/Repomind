import './globals.css';

export const metadata = {
    title: 'RepoMind - AI Codebase Assistant',
    description: 'Interact with public GitHub repositories using AI.',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}

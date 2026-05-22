import Link from 'next/link';

export default function Navbar({ children }: { children?: React.ReactNode }) {
    return (
        <nav className="nav-bar">
            <div className="nav-brand" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                <Link href="/" style={{ border: 'none', fontWeight: 'bold' }}>&gt;_ READAURA</Link>
                <Link href="/reports" style={{ fontSize: '0.9rem' }}>LIBRARY</Link>
            </div>
            {children && (
                <div className="nav-center">
                    {children}
                </div>
            )}
        </nav>
    );
}

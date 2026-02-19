import Link from 'next/link';

export default function Logo() {
    return (
        <Link href="/" className="flex items-center space-x-1 hover:opacity-80 transition-opacity">
            <span className="text-2xl font-black tracking-tighter text-gray-900 drop-shadow-sm">
                Still<span className="text-emerald-500">Open</span>
            </span>
        </Link>
    );
}

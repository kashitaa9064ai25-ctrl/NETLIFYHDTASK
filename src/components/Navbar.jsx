import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Searchable static application pages
const SITE_PAGES = [
  { name: 'About Us', path: '/about', keywords: ['about', 'team', 'who', 'info'] },
  { name: 'Home', path: '/', keywords: ['home', 'main', 'landing'] },
  { name: 'Browse Posts', path: '/browse', keywords: ['browse', 'posts', 'articles', 'questions', 'feed'] },
  { name: 'Pricing & Plans', path: '/pricing', keywords: ['pricing', 'plans', 'subscription', 'paid', 'upgrade'] },
  { name: 'Create Post', path: '/post', keywords: ['post', 'create', 'new', 'ask', 'write'] },
  { name: 'Admin Dashboard', path: '/admin', keywords: ['admin', 'analytics', 'moderation'] }
];

function Navbar() {
  const { currentUser, userPlan, isTrialActive, logout } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ pages: [], posts: [], authors: [], tags: [] });
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef(null);

  const ADMIN_EMAIL = (
    import.meta.env.VITE_ADMIN_EMAIL ||
    import.meta.env.VITE_MAILGUN_ADMIN_EMAIL ||
    'nkashitaa5@gmail.com'
  ).toLowerCase().trim();

  const isAdmin =
    currentUser &&
    currentUser.email &&
    currentUser.email.toLowerCase().trim() === ADMIN_EMAIL;

  useEffect(() => {
    if (!query.trim()) {
      setResults({ pages: [], posts: [], authors: [], tags: [] });
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      const q = query.toLowerCase().trim();

      const matchingPages = SITE_PAGES.filter((page) => {
        if (page.path === '/admin' && !isAdmin) return false;
        return (
          page.name.toLowerCase().includes(q) ||
          page.keywords.some((k) => k.includes(q))
        );
      });

      try {
        const res = await fetch(`/api/posts?userPlan=${userPlan}`);
        const data = await res.json();

        if (data.success && data.posts) {
          const matchingPosts = data.posts
            .filter((p) => p.title?.toLowerCase().includes(q) || p.text?.toLowerCase().includes(q))
            .slice(0, 3);

          const matchingAuthors = [
            ...new Set(
              data.posts
                .map((p) => p.authorName)
                .filter((name) => name && name.toLowerCase().includes(q))
            ),
          ].slice(0, 3);

          const allTags = [];
          data.posts.forEach((p) => {
            if (Array.isArray(p.tags)) {
              p.tags.forEach((t) => {
                const cleanTag = t.toLowerCase().trim();
                if (cleanTag.includes(q) && !allTags.includes(cleanTag)) {
                  allTags.push(cleanTag);
                }
              });
            }
          });

          setResults({
            pages: matchingPages,
            posts: matchingPosts,
            authors: matchingAuthors,
            tags: allTags.slice(0, 4),
          });
          setIsOpen(true);
        }
      } catch (err) {
        setResults({
          pages: matchingPages,
          posts: [],
          authors: [],
          tags: []
        });
        setIsOpen(matchingPages.length > 0);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, userPlan, isAdmin]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setIsOpen(false);
    const q = query.toLowerCase().trim();

    const matchedPage = SITE_PAGES.find(
      (p) => p.name.toLowerCase() === q || p.keywords.includes(q)
    );

    if (matchedPage) {
      setQuery('');
      navigate(matchedPage.path);
      return;
    }

    if (q) {
      navigate(`/browse?q=${encodeURIComponent(query.trim())}`);
    } else {
      navigate('/browse');
    }
  };

  const handleSelectResult = (url) => {
    setIsOpen(false);
    setQuery('');
    navigate(url);
  };

  return (
    <header className="bg-gray-100 border-b border-gray-300 py-2 px-3 sm:px-6 sticky top-0 z-50 w-full">
      <div className="w-full flex items-center justify-between gap-1 sm:gap-3 flex-nowrap">

        {/* Left Side: Brand Logo & Main Nav Links */}
        <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
          <Link
            to="/"
            className="font-bold text-base sm:text-lg lg:text-xl text-gray-800 tracking-tight hover:text-black shrink-0"
          >
            DEV@Deakin
          </Link>
          <nav className="flex items-center space-x-1.5 sm:space-x-3 text-xs sm:text-sm font-medium text-gray-700">
            <Link to="/" className="hover:text-black transition px-1 py-0.5">
              Home
            </Link>
            <Link to="/about" className="hover:text-black transition px-1 py-0.5">
              About
            </Link>
            <Link
              to="/browse"
              className="hover:text-black transition font-semibold text-blue-700 px-1 py-0.5"
            >
              Browse Posts
            </Link>
            <Link to="/pricing" className="hover:text-black transition px-1 py-0.5">
              Pricing
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="bg-purple-100 text-purple-800 border border-purple-300 px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:bg-purple-200"
              >
                Admin
              </Link>
            )}
          </nav>
        </div>

        {/* Center: Search Bar with min-width guard & responsive text */}
        <div ref={searchRef} className="relative flex-1 min-w-[130px] max-w-sm mx-1 sm:mx-2">
          <form onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => query.trim() && setIsOpen(true)}
              className="w-full px-2.5 py-1 text-xs sm:text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
            />
          </form>

          {/* Search Dropdown */}
          {isOpen && (
            results.pages.length > 0 ||
            results.posts.length > 0 ||
            results.authors.length > 0 ||
            results.tags.length > 0
          ) && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 overflow-hidden divide-y divide-gray-100 text-xs">
                {results.pages.length > 0 && (
                  <div className="p-1.5 bg-slate-50">
                    <div className="text-[10px] font-bold uppercase text-slate-500 px-1.5 py-0.5">Quick Navigation</div>
                    {results.pages.map((p) => (
                      <div
                        key={p.path}
                        onClick={() => handleSelectResult(p.path)}
                        className="px-2 py-1 hover:bg-slate-200 rounded cursor-pointer flex justify-between items-center text-slate-800 font-medium"
                      >
                        <span>Go to {p.name}</span>
                        <span className="text-[9px] bg-slate-200 text-slate-600 px-1 py-0.5 rounded">Page</span>
                      </div>
                    ))}
                  </div>
                )}

                {results.posts.length > 0 && (
                  <div className="p-1.5">
                    <div className="text-[10px] font-bold uppercase text-gray-400 px-1.5 py-0.5">Articles & Questions</div>
                    {results.posts.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleSelectResult(`/browse?q=${encodeURIComponent(p.title)}`)}
                        className="px-2 py-1 hover:bg-blue-50 rounded cursor-pointer flex justify-between items-center"
                      >
                        <span className="font-medium text-gray-800 truncate">{p.title}</span>
                        <span className="text-[9px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded ml-1 shrink-0">{p.postType}</span>
                      </div>
                    ))}
                  </div>
                )}

                {results.authors.length > 0 && (
                  <div className="p-1.5">
                    <div className="text-[10px] font-bold uppercase text-gray-400 px-1.5 py-0.5">Authors</div>
                    {results.authors.map((author) => (
                      <div
                        key={author}
                        onClick={() => handleSelectResult(`/browse?q=${encodeURIComponent(author)}`)}
                        className="px-2 py-1 hover:bg-emerald-50 rounded cursor-pointer text-emerald-800 font-medium"
                      >
                        👤 {author}
                      </div>
                    ))}
                  </div>
                )}

                {results.tags.length > 0 && (
                  <div className="p-1.5">
                    <div className="text-[10px] font-bold uppercase text-gray-400 px-1.5 py-0.5">Tags</div>
                    <div className="flex flex-wrap gap-1 px-1 py-0.5">
                      {results.tags.map((t) => (
                        <span
                          key={t}
                          onClick={() => handleSelectResult(`/browse?q=${encodeURIComponent(t)}`)}
                          className="bg-gray-100 hover:bg-blue-100 text-blue-700 font-medium px-1.5 py-0.5 rounded cursor-pointer transition text-[10px]"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  onClick={handleSearchSubmit}
                  className="p-1.5 text-center bg-gray-50 hover:bg-gray-100 font-semibold text-blue-600 cursor-pointer text-xs"
                >
                  Search all posts for "{query}" →
                </div>
              </div>
            )}
        </div>

        {/* Right Side: Post Button & User Profile Controls */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm font-medium text-gray-700 shrink-0">
          <Link to="/post" className="hover:text-black transition px-1 py-0.5 shrink-0">
            Post
          </Link>

          {currentUser ? (
            <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
              <span
                className={`text-[9px] sm:text-[11px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider border shrink-0 ${userPlan === 'Paid'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-gray-100 text-gray-600 border-gray-300'
                  }`}
              >
                {userPlan === 'Paid' && isTrialActive ? 'Trial' : userPlan}
              </span>
              <span
                className="text-gray-800 font-semibold text-xs max-w-[70px] sm:max-w-[110px] truncate shrink-0"
                title={currentUser.displayName || currentUser.email}
              >
                {currentUser.displayName || currentUser.email}
              </span>
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="bg-white border border-gray-300 px-2 py-0.5 text-xs rounded hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition shrink-0"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="bg-white border border-gray-300 px-2.5 py-1 text-xs rounded hover:bg-gray-100 hover:text-black transition shrink-0"
            >
              Login
            </Link>
          )}
        </div>

      </div>
    </header>
  );
}

export default Navbar;
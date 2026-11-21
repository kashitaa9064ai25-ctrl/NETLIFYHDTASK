import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { marked } from 'marked';

export default function CreatePost() {
    const { currentUser, userPlan } = useAuth();
    const navigate = useNavigate();

    const [postType, setPostType] = useState('Question'); // 'Question' | 'Article'
    const [plan, setPlan] = useState('Free'); // 'Free' | 'Paid'
    const [title, setTitle] = useState('');
    const [abstract, setAbstract] = useState('');
    const [text, setText] = useState('');
    const [tags, setTags] = useState('');

    // Markdown Tab Control
    const [activeTab, setActiveTab] = useState('write'); // 'write' | 'preview'
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Quick insertion helpers for Markdown
    const insertMarkdown = (syntax) => {
        setText((prev) => prev + syntax);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!currentUser) return setError('You must be logged in to create a post.');
        if (!title.trim() || !text.trim()) return setError('Title and content are required.');

        setSubmitting(true);
        setError('');

        try {
            const response = await fetch('http://localhost:5000/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.uid,
                    authorName: currentUser.displayName || currentUser.email.split('@')[0],
                    postType,
                    plan: userPlan === 'Paid' ? plan : 'Free',
                    title,
                    abstract,
                    text,
                    tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
                }),
            });

            const data = await response.json();
            if (response.ok && data.success) {
                navigate('/browse');
            } else {
                setError(data.message || 'Failed to submit post.');
            }
        } catch (err) {
            setError('Could not connect to backend server.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-10 px-4">
            <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
                <h1 className="text-2xl font-bold text-gray-800 mb-6">Create a New Post</h1>

                {error && <div className="mb-6 p-3 bg-red-50 text-red-700 text-xs rounded border border-red-200">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Post Type Selector */}
                    <div className="flex items-center gap-6">
                        <span className="text-sm font-semibold text-gray-700">Select Post Type:</span>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                                type="radio"
                                name="postType"
                                value="Question"
                                checked={postType === 'Question'}
                                onChange={() => setPostType('Question')}
                                className="text-blue-600 focus:ring-blue-500"
                            />
                            Question
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                                type="radio"
                                name="postType"
                                value="Article"
                                checked={postType === 'Article'}
                                onChange={() => setPostType('Article')}
                                className="text-blue-600 focus:ring-blue-500"
                            />
                            Article
                        </label>
                    </div>

                    {/* Subscription Tier Visibility */}
                    {userPlan === 'Paid' && (
                        <div className="flex items-center gap-4 bg-amber-50 p-3 rounded-lg border border-amber-200">
                            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">Access Tier:</span>
                            <label className="flex items-center gap-1.5 text-xs font-medium text-amber-900 cursor-pointer">
                                <input
                                    type="radio"
                                    name="plan"
                                    value="Free"
                                    checked={plan === 'Free'}
                                    onChange={() => setPlan('Free')}
                                />
                                Public (Free Tier Readers)
                            </label>
                            <label className="flex items-center gap-1.5 text-xs font-medium text-amber-900 cursor-pointer">
                                <input
                                    type="radio"
                                    name="plan"
                                    value="Paid"
                                    checked={plan === 'Paid'}
                                    onChange={() => setPlan('Paid')}
                                />
                                Exclusive (Paid Tier Members Only)
                            </label>
                        </div>
                    )}

                    {/* Title */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
                        <input
                            type="text"
                            required
                            placeholder={postType === 'Question' ? 'e.g., How to handle nested state in React?' : 'e.g., Building Secure Web Applications in 2026'}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Abstract (for Articles) */}
                    {postType === 'Article' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Abstract / Summary</label>
                            <textarea
                                rows={2}
                                placeholder="A concise summary of your article..."
                                value={abstract}
                                onChange={(e) => setAbstract(e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    )}

                    {/* MARKDOWN EDITOR WITH LIVE PREVIEW */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-gray-700">Content (Markdown Supported)</label>

                            {/* Tabs */}
                            <div className="flex border border-gray-300 rounded overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('write')}
                                    className={`px-3 py-1 text-xs font-medium ${activeTab === 'write' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                                >
                                    Write
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('preview')}
                                    className={`px-3 py-1 text-xs font-medium ${activeTab === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                                >
                                    Live Preview
                                </button>
                            </div>
                        </div>

                        {/* Quick Markdown Helpers */}
                        {activeTab === 'write' && (
                            <div className="flex gap-2 mb-2 flex-wrap">
                                <button type="button" onClick={() => insertMarkdown('**bold**')} className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 border rounded text-xs font-bold">B</button>
                                <button type="button" onClick={() => insertMarkdown('*italic*')} className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 border rounded text-xs italic">I</button>
                                <button type="button" onClick={() => insertMarkdown('### Heading\n')} className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 border rounded text-xs font-mono">H3</button>
                                <button type="button" onClick={() => insertMarkdown('`code`')} className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 border rounded text-xs font-mono">&lt;/&gt;</button>
                                <button type="button" onClick={() => insertMarkdown('\n```javascript\n// your code here\n```\n')} className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 border rounded text-xs font-mono">Codeblock</button>
                                <button type="button" onClick={() => insertMarkdown('\n- Item 1\n- Item 2\n')} className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 border rounded text-xs">List</button>
                            </div>
                        )}

                        {/* Write View */}
                        {activeTab === 'write' ? (
                            <textarea
                                required
                                rows={10}
                                placeholder="Write your markdown content here..."
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                className="w-full border border-gray-300 font-mono rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        ) : (
                            /* Preview View */
                            <div
                                className="w-full min-h-[250px] p-4 border border-gray-300 rounded bg-gray-50 prose prose-sm max-w-none text-gray-800"
                                dangerouslySetInnerHTML={{
                                    __html: text ? marked.parse(text) : '<p class="text-gray-400 italic">Nothing to preview yet. Switch back to Write to add content.</p>',
                                }}
                            />
                        )}
                        <p className="text-[11px] text-gray-400 mt-1">Characters: {text.length} | Words: {text.trim() ? text.trim().split(/\s+/).length : 0}</p>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Tags (Comma-separated)</label>
                        <input
                            type="text"
                            placeholder="e.g. react, nodejs, firebase, architecture"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3 bg-gray-900 hover:bg-black text-white font-semibold rounded text-sm shadow transition disabled:opacity-50"
                    >
                        {submitting ? 'Publishing...' : 'Publish Post'}
                    </button>
                </form>
            </div>
        </div>
    );
}
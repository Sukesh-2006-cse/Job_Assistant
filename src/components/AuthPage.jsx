import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AuthPage.css';
import SocialLogin from './SocialLogin';
import NotificationModal from './NotificationModal';

const AuthPage = () => {
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
    });
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        type: 'success',
        title: '',
        message: '',
        navTo: ''
    });

    const toggleMode = () => {
        setIsLogin(!isLogin);
        setFormData({ name: '', email: '', password: '' });
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const endpoint = isLogin ? '/api/login' : '/api/register';

        try {
            const response = await fetch(`http://127.0.0.1:5000${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Authentication failed');
            }

            // Store user info and token
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            setModalConfig({
                isOpen: true,
                type: 'success',
                title: isLogin ? 'Welcome Back!' : 'Success!',
                message: isLogin
                    ? `Great to see you again, ${data.user.name.split(' ')[0]}!`
                    : `Your account is ready, ${data.user.name.split(' ')[0]}! Let's get started on your job journey.`,
                navTo: data.user.isOnboarded ? '/dashboard' : '/onboarding'
            });

        } catch (error) {
            console.error('Auth Error:', error);
            setModalConfig({
                isOpen: true,
                type: 'error',
                title: 'Oops!',
                message: error.message || 'Authentication failed. Please check your credentials.',
                navTo: null
            });
        }
    };

    const handleModalConfirm = () => {
        const { navTo } = modalConfig;
        setModalConfig(prev => ({ ...prev, isOpen: false }));
        if (navTo) {
            navigate(navTo);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
                    <p>{isLogin ? 'Enter your credentials to access your account' : 'Join us and start your journey today'}</p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    {!isLogin && (
                        <div className="form-group">
                            <label htmlFor="name">Full Name</label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                placeholder="John Doe"
                                value={formData.name}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label htmlFor="email">Email Address</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            placeholder="name@example.com"
                            value={formData.email}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <button type="submit" className="auth-button">
                        {isLogin ? 'Login' : 'Register'}
                    </button>
                </form>

                <div className="auth-toggle">
                    {isLogin ? (
                        <>
                            Don't have an account? <span onClick={toggleMode}>Register</span>
                        </>
                    ) : (
                        <>
                            Already have an account? <span onClick={toggleMode}>Login</span>
                        </>
                    )}
                </div>

                <SocialLogin />
            </div>

            <NotificationModal
                isOpen={modalConfig.isOpen}
                type={modalConfig.type}
                title={modalConfig.title}
                message={modalConfig.message}
                onConfirm={handleModalConfirm}
            />
        </div>
    );
};

export default AuthPage;

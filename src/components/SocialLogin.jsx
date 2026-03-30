import { useGoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import './SocialLogin.css';
import NotificationModal from './NotificationModal';
import { useState } from 'react';

const SocialLogin = () => {
    const navigate = useNavigate();
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        type: 'success',
        title: '',
        message: '',
        navTo: ''
    });

    const login = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            console.log('Google Success:', tokenResponse);

            try {
                const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                const userInfo = await userInfoRes.json();

                const response = await fetch('http://127.0.0.1:5000/api/google-auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: userInfo.email,
                        name: userInfo.name,
                        sub: userInfo.sub
                    }),
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error);

                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));

                setModalConfig({
                    isOpen: true,
                    type: 'success',
                    title: 'Authenticated!',
                    message: `Welcome aboard, ${data.user.name.split(' ')[0]}! Your job hunt just got easier.`,
                    navTo: data.user.isOnboarded ? '/discover' : '/onboarding'
                });

            } catch (error) {
                console.error('Google Auth Error:', error);
                setModalConfig({
                    isOpen: true,
                    type: 'error',
                    title: 'Auth Error',
                    message: 'Authentication with Google failed. Please check your account and try again.',
                    navTo: null
                });
            }
        },
        onError: (error) => {
            console.log('Login Failed:', error);
            if (error.error === 'popup_closed_by_user') {
                setModalConfig({
                    isOpen: true,
                    type: 'error',
                    title: 'Popup Closed',
                    message: 'The login window was closed before completion. Please try again.',
                    navTo: null
                });
            } else {
                setModalConfig({
                    isOpen: true,
                    type: 'error',
                    title: 'Popup Blocked',
                    message: 'Google Login failed. This usually happens if popups are blocked by your browser. Please allow popups for this site.',
                    navTo: null
                });
            }
        },
        flow: 'implicit',
    });

    const handleModalConfirm = () => {
        const { navTo } = modalConfig;
        setModalConfig(prev => ({ ...prev, isOpen: false }));
        if (navTo) {
            navigate(navTo);
        }
    };

    return (
        <div className="social-login-container">
            <div className="social-separator">
                <span>Or continue with</span>
            </div>

            <button className="google-login-btn" onClick={login}>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" />
                Sign in with Google
            </button>

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

export default SocialLogin;

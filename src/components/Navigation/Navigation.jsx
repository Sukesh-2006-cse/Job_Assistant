import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Compass, ClipboardList, TrendingUp, User, LogOut, BarChart2 } from 'lucide-react';
import './Navigation.css';

const Navigation = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user'));

    const handleLogout = () => {
        localStorage.clear();
        window.location.href = '/';
    };

    return (
        <nav className="main-nav">
            <div className="logo" onClick={() => navigate('/dashboard')}>Apply-Flow</div>
            <div className="nav-links">
                <NavLink to="/dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    <LayoutDashboard size={18} /> Butler
                </NavLink>
                <NavLink to="/discover" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    <Compass size={18} /> Discover
                </NavLink>
                <NavLink to="/applications" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    <ClipboardList size={18} /> My Applications
                </NavLink>
                <NavLink to="/career" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    <TrendingUp size={18} /> Career Butler
                </NavLink>
                <NavLink to="/analytics" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    <BarChart2 size={18} /> Analytics
                </NavLink>
                <NavLink to="/profile" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    <User size={18} /> Profile
                </NavLink>
            </div>
            <div className="user-profile">
                <span className="user-name">Welcome, {user?.name || 'Explorer'}</span>
                <button onClick={handleLogout} className="logout-btn">
                    <LogOut size={16} /> Logout
                </button>
            </div>
        </nav>
    );
};

export default Navigation;

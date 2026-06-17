import { useState, useRef, useEffect } from "react";
import './User.css';
import api from '../Auth/axios';
import { useNavigate, useLocation } from "react-router-dom";
import signupIllustration from './signup_illustration.png';

export default function Login({ defaultIsLogin = true }) {
    const navigate = useNavigate();
    const location = useLocation();
    const passref = useRef();
    
    const [isLogin, setIsLogin] = useState(defaultIsLogin);
    const [error, setError] = useState("");
    
    // Welcome Banner and Animation state triggers
    const [showWelcome, setShowWelcome] = useState(false);
    const [animationKey, setAnimationKey] = useState(0);

    // Form states
    const [loginData, setLoginData] = useState({
        username: "",
        password: ""
    });
    
    const [signupData, setSignupData] = useState({
        name: "",
        gender: "",
        email: "",
        age: "",
        address: "",
        password: ""
    });

    // Synchronize the sliding panels on path changes (e.g. browser back/forward buttons)
    useEffect(() => {
        if (location.pathname === "/login") {
            setIsLogin(true);
        } else if (location.pathname === "/") {
            setIsLogin(false);
        }
    }, [location.pathname]);

    // Restart animations and set/clear timeouts whenever panels slide or mount
    useEffect(() => {
        setShowWelcome(false);
        setAnimationKey(prev => prev + 1);
    }, [isLogin]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setShowWelcome(true);
        }, 2100);
        return () => clearTimeout(timer);
    }, [animationKey]);

    const handleToggle = (toLogin) => {
        setIsLogin(toLogin);
        setError("");
        if (toLogin) {
            navigate('/login');
        } else {
            navigate('/');
        }
    };

    const handleLoginSubmit = async (e) => {
        if (e) e.preventDefault();
        setError("");
        try {
            const formData = new URLSearchParams();
            formData.append("username", loginData.username);
            formData.append("password", loginData.password);

            const res = await api.post('/login_user', formData);
            console.log(res.data);
            localStorage.setItem("token", res.data.access_token);
            navigate('/dashboard');
        } catch (err) {
            console.log(err.response?.data);
            const message = err.response?.data?.detail;

            if (message === "user Not registered") {
                alert("User not registered");
                handleToggle(false); // Switch to signup
            } else if (message === "password doest not match") {
                alert("Password does not match");
                setLoginData({ ...loginData, password: "" });
                setError("Password is wrong");
                if (passref.current) passref.current.focus();
            } else {
                setError("Something went wrong");
            }
        }
    };

    const handleSignupSubmit = async (e) => {
        if (e) e.preventDefault();
        setError("");
        try {
            const res = await api.post('/create_user', signupData);
            console.log(res.data);
            alert("Signup successful");
            handleToggle(true); // Switch to login screen smoothly
        } catch (err) {
            console.log(err);
            setError(err.response?.data?.detail || "Signup failed");
            alert(err.response?.data?.detail || "Signup failed");
        }
    };

    return (
        <div className={`split-auth-container ${isLogin ? 'mode-login' : 'mode-signup'}`}>
            
            {/* Left Column: Form Panel (slides Left/Right) */}
            <div className="auth-form-panel">
                <div className="threads-card">
                    <h1>CLAY</h1>
                    <h2>{isLogin ? "Log in with your email" : "Create your account"}</h2>
                    
                    {isLogin ? (
                        /* Login Form Card Content */
                        <form className="threads-input-group" onSubmit={handleLoginSubmit}>
                            <input
                                type="email"
                                className="threads-input-field"
                                placeholder="Email"
                                value={loginData.username}
                                onChange={(e) => setLoginData({...loginData, username: e.target.value})}
                                required
                            />
                            <input
                                type="password"
                                className="threads-input-field"
                                placeholder="Password"
                                ref={passref}
                                value={loginData.password}
                                onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                                required
                            />
                            <button type="submit" className="threads-action-btn">Log in</button>
                        </form>
                    ) : (
                        /* Signup Form Card Content */
                        <form className="threads-input-group" onSubmit={handleSignupSubmit}>
                            <input
                                type="text"
                                className="threads-input-field"
                                placeholder="Name"
                                value={signupData.name}
                                onChange={(e) => setSignupData({...signupData, name: e.target.value})}
                                required
                            />
                            
                            <div className="signup-row">
                                <input
                                    type="text"
                                    className="threads-input-field"
                                    placeholder="Gender"
                                    value={signupData.gender}
                                    onChange={(e) => setSignupData({...signupData, gender: e.target.value})}
                                    style={{ flex: 1 }}
                                    required
                                />
                                <input
                                    type="number"
                                    className="threads-input-field"
                                    placeholder="Age"
                                    value={signupData.age}
                                    onChange={(e) => setSignupData({...signupData, age: e.target.value})}
                                    style={{ flex: 1 }}
                                    required
                                />
                            </div>

                            <input
                                type="email"
                                className="threads-input-field"
                                placeholder="Email"
                                value={signupData.email}
                                onChange={(e) => setSignupData({...signupData, email: e.target.value})}
                                required
                            />
                            <input
                                type="text"
                                className="threads-input-field"
                                placeholder="Address"
                                value={signupData.address}
                                onChange={(e) => setSignupData({...signupData, address: e.target.value})}
                                required
                            />
                            <input
                                type="password"
                                className="threads-input-field"
                                placeholder="Password"
                                value={signupData.password}
                                onChange={(e) => setSignupData({...signupData, password: e.target.value})}
                                required
                            />
                            
                            <button type="submit" className="threads-action-btn">Sign up</button>
                        </form>
                    )}

                    {error && <p className="error-text" style={{ marginTop: '8px' }}>{error}</p>}
                    
                    <div className="threads-divider"></div>

                    {/* Modern Switching Toggle Pill shifted to the bottom */}
                    <div className="auth-toggle-pill" style={{ margin: '8px auto 0 auto' }}>
                        <div 
                            className={`toggle-btn ${isLogin ? 'active' : ''}`}
                            onClick={() => handleToggle(true)}
                        >
                            Log In
                        </div>
                        <div 
                            className={`toggle-btn ${!isLogin ? 'active' : ''}`}
                            onClick={() => handleToggle(false)}
                        >
                            Sign Up
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Column: Graphic Stacking Panel */}
            <div className="auth-graphic-panel">
                {/* Wallpaper Watermark behind the scene */}
                <div 
                    className="graphic-watermark" 
                    style={{ backgroundImage: `url(${signupIllustration})` }}
                />

                {/* Animated Falling Brick Cards Container */}
                <div className="falling-bricks-canvas" key={animationKey}>
                    
                    {/* Welcome banner revealed after brick sequence */}
                    {showWelcome && (
                        <div className="welcome-banner">
                            <h3>Welcome to Clay Docs</h3>
                            <p>Collaborative editor spaces, live session syncs, and intelligent smart suggestions.</p>
                        </div>
                    )}

                    {/* Card 1: Sophia Vance (Blue badge style) */}
                    <div className="brick-card card-1">
                        <div className="brick-header">
                            <div className="brick-profile-group">
                                <div className="brick-avatar blue">SV</div>
                                <div className="brick-user-info">
                                    <span className="brick-name">Sophia Vance</span>
                                    <span className="brick-handle">@sophiav</span>
                                </div>
                            </div>
                            <button type="button" className="brick-action-btn active">Active</button>
                        </div>
                        <p className="brick-desc">Drafting the Q3 Product Roadmap spec on Clay Docs.</p>
                        <div className="brick-footer">10m ago • Editing</div>
                    </div>

                    {/* Card 2: Alex Rivera (Purple Badge) */}
                    <div className="brick-card card-2">
                        <div className="brick-header">
                            <div className="brick-profile-group">
                                <div className="brick-avatar purple">AR</div>
                                <div className="brick-user-info">
                                    <span className="brick-name">Alex Rivera</span>
                                    <span className="brick-handle">@alexr</span>
                                </div>
                            </div>
                            <span className="brick-action-btn badge">Editor</span>
                        </div>
                        <p className="brick-desc">Left comments on version 3.2. Ready for review.</p>
                        <div className="brick-footer">2m ago • Comments</div>
                    </div>

                    {/* Card 3: User/Collaborator (Pink Badge) */}
                    <div className="brick-card card-3">
                        <div className="brick-header">
                            <div className="brick-profile-group">
                                <div className="brick-avatar pink">U</div>
                                <div className="brick-user-info">
                                    <span className="brick-name">You</span>
                                    <span className="brick-handle">@collaborator</span>
                                </div>
                            </div>
                            <span className="brick-action-btn badge">Connected</span>
                        </div>
                        <p className="brick-desc">Restored version 3.4. Syncing changes live.</p>
                        <div className="brick-footer">Just now • Saved</div>
                    </div>

                </div>
            </div>

            {/* Absolute bottom copyright info */}
            <div className="threads-bottom-legal">
                © 2026 Clay Docs • Terms • Privacy Policy • Cookies Policy
            </div>
        </div>
    );
}

export default function MainContentModule({ token }) {
    return (
        <div style={{ padding: "2rem", minHeight: "80vh" }}>
            {token ? (
                <h2>Welcome back! You are logged in.</h2>
            ) : (
                <h2>Please log in to access the content.</h2>
            )}
        </div>
    );
}

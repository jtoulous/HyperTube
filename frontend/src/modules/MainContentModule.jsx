import { GlobalState } from "../State";

export default function MainContentModule() {
    const { isLogged } = GlobalState();

    return (
        <div style={{ padding: "2rem", minHeight: "80vh" }}>
            {isLogged ? (
                <h2>Welcome back! You are logged in.</h2>
            ) : (
                <h2>Please log in to access the content.</h2>
            )}
        </div>
    );
}

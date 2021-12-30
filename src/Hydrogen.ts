import { Platform, Client, LoadStatus, createNavigation, createRouter, RoomViewModel, TimelineView, } from "hydrogen-view-sdk";
import assetPaths from "hydrogen-view-sdk/paths/vite";
import "hydrogen-view-sdk/style.css";

export class Hydrogen {
    private readonly _homeserver: string;
    private _platform: Record<string, any>;
    private _client: Record<string, any>;
    private _urlRouter: Record<string, any>;
    private _navigation: Record<string, any>;
    private _container: HTMLDivElement;

    constructor(homeserver: string, container: HTMLDivElement) {
        this._homeserver = homeserver;
        this._container = container;
        this._platform = new Platform(container, assetPaths, {}, { development: import.meta.env.DEV });
        this._navigation = createNavigation();
        this._platform.setNavigation(this._navigation);
        this._urlRouter = createRouter({ navigation: this._navigation, history: this._platform.history });
        this._urlRouter.attach();
        this._client = new Client(this._platform);
    }

    async register(username: string, password: string, initialDeviceDisplayName: string) {
        let stage = await this._client.startRegistration(this._homeserver, username, password, initialDeviceDisplayName);
        while (stage !== true) {
            stage = await stage.complete();
        }
        return stage;
    }

    async login(username: string, password: string) {
        const loginOptions = await this._client.queryLogin(this._homeserver).result;
        this._client.startWithLogin(loginOptions.password(username, password));

        await this._client.loadStatus.waitFor((status: string) => {
            return status === LoadStatus.Ready ||
                status === LoadStatus.Error ||
                status === LoadStatus.LoginFailed;
        }).promise;

        if (this._client.loginFailure) {
            throw new Error("login failed: " + this._client.loginFailure);
        } else if (this._client.loadError) {
            throw new Error("load failed: " + this._client.loadError.message);
        }
    }

    async showRoom(roomId: string) {
        const room = this._session.rooms.get(roomId) ?? await this._joinRoom(roomId);
        const vm = new RoomViewModel({
            room,
            ownUserId: this._session.userId,
            platform: this._platform,
            urlCreator: this._urlRouter,
            navigation: this._navigation,
        });
        await vm.load();
        const view = new TimelineView(vm.timelineViewModel);
        this._container.appendChild(view.mount());
    }

    private async _joinRoom(roomId: string): Promise<any> {
        await this._session.joinRoom(roomId);
        // even though we've joined the room, we need to wait till the next sync for the actual room
        await this._waitForRoomFromSync(roomId);
        return this._session.rooms.get(roomId);

    }

    private _waitForRoomFromSync(roomId: string): Promise<void> {
        let resolve: () => void;
        const promise: Promise<void> = new Promise(r => { resolve = r; })
        const subscription = {
            onAdd: (_: string, value: {id: string}) => {
                if (value.id === roomId) {
                    this._session.rooms.unsubscribe(subscription);
                    resolve();
                }
            },
        };
        this._session.rooms.subscribe(subscription);
        return promise;
    }

    private get _session() { return this._client.session; }
}

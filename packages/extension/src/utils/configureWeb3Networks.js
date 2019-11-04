import {
    NETWORKS,
} from '~config/constants';
import {
    get,
} from '~utils/storage';

import Provider from '~/config/provider';
import {
    AZTECAccountRegistryConfig,
    ACEConfig,
    IZkAssetConfig,
} from '~/config/contracts';
import NetworkService from '~helpers/NetworkService/factory';
import getGanacheNetworkId from '~utils/getGanacheNetworkId';

const contractsForNetwork = (networkId) => {
    const contractsConfigs = [
        AZTECAccountRegistryConfig,
        ACEConfig,
        IZkAssetConfig,
    ];

    return contractsConfigs.map(contractConfig => ({
        config: contractConfig.config,
        address: contractConfig.networks[networkId],
    }));
};

const configureWeb3Networks = async () => {
    const providerUrlGanache = await get('__providerUrl');
    const infuraProjectId = await get('__infuraProjectId');

    const infuraNetworksConfigs = [
        NETWORKS.RINKEBY,
        NETWORKS.MAIN,
        // NETWORKS.ROPSTEN,
        // NETWORKS.GOERLI,
        // NETWORKS.KOVAN,
    ].map(networkName => Provider.infuraConfig(networkName, infuraProjectId));

    const ganacheNetworkId = getGanacheNetworkId();
    const {
        networkName: ganacheNetworkName,
    } = NETWORKS.GANACHE;
    const ganacheNetworkConfigs = providerUrlGanache ? [{
        title: ganacheNetworkName,
        networkId: ganacheNetworkId,
        providerUrl: providerUrlGanache,
    }] : [];

    const configs = [
        ...ganacheNetworkConfigs,
        ...infuraNetworksConfigs,
    ].map(config => ({
        ...config,
        contractsConfigs: contractsForNetwork(config.networkId),
    }));

    NetworkService.setConfigs(configs);
};

export default configureWeb3Networks;